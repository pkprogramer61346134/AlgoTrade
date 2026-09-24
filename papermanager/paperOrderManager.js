const PaperWS = require('./paperws');
const SelectStrikePriceBasedOnBalance = require('../ordermanager/selectestrikpricebaseofbalalace');
const LiveTrackPnL = require('../ordermanager/livetrackpnl');
const TrailingSLManager = require('../ordermanager/trailingslmanager');
const PaperOrderPlace = require('./paperorderplace');
const PaperJournal = require('./paperjournal');

/**
 * PAPER ORDER MANAGER (Modular Virtual Trading Engine)
 * 
 * Uses modular architecture, delegating virtual order placement to PaperOrderPlace,
 * and persisting paper trade history to paper_journal.json via PaperJournal.
 */
class PaperOrderManager {
    constructor(options = {}) {
        // Step 1: Dedicated Paper WebSocket Connection Manager (paperOrderManager client)
        options.clientId = options.clientId || 'paperOrderManager';
        this.wsManager = new PaperWS(options);

        // Steps 2-6: Single Responsibility Modular Classes
        this.strikeSelector = new SelectStrikePriceBasedOnBalance();
        this.paperOrderPlacer = new PaperOrderPlace();
        this.pnlTracker = new LiveTrackPnL();
        this.trailManager = new TrailingSLManager();
        this.paperJournal = new PaperJournal();

        // Active State Tracking (Loaded from paper_journal.json)
        const initialBalance = options.virtualBalance || 10000.0;
        const savedJournal = this.paperJournal.loadJournal(initialBalance);

        this.activePosition = null;
        this.isOrderActive = false;
        this.virtualBalance = savedJournal.virtualBalance;
        this.todaySummary = savedJournal.todaySummary;
        this.tradeHistory = savedJournal.tradeHistory;
        this.virtualMarginUsed = 0.0;

        this.autoCutTimer = null;
    }

    /**
     * Initialize Paper Order Manager WS & Telemetry
     */
    async init() {
        console.log(`🚀 [PAPER ORDER MANAGER] Starting Virtual Trading Engine...`);
        await this.wsManager.connect(async (msg) => {
            await this.handleIncomingSignal(msg);
        });

        this.scheduleAutoCut310();
        this.startHeartbeatSync();
        this.broadcastTelemetry("PAPER_SYSTEM_INITIALIZED", { status: "ONLINE", virtualBalance: this.virtualBalance });
    }

    startHeartbeatSync() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
            this.broadcastTelemetry("HEARTBEAT_SYNC", { status: "ONLINE", virtualBalance: this.virtualBalance });
        }, 5000);
    }

    /**
     * Handles incoming consensus signals from Head
     */
    async handleIncomingSignal(msg) {
        if (!msg) return;

        let payload = msg.payload || msg.data || msg;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) {}
        }

        if (payload.action === 'GET_PAPER_STATE' || payload.type === 'GET_PAPER_STATE') {
            this.broadcastTelemetry("STATE_SYNC", { status: "ONLINE", virtualBalance: this.virtualBalance });
        }

        if (payload.action === 'CONSENSUS_SIGNAL_RESPONSE' || payload.singleSignal) {
            const signal = payload.singleSignal || payload.signal || payload;
            console.log(`📩 [PAPER ORDER MANAGER] Received Consensus Signal from Master Head: ${signal.consensus || 'NO_SIGNAL'} (Spot ₹${signal.entry || 'N/A'} | Strategy: ${signal.strategyName || 'Master Head'})`);
            this.broadcastTelemetry("PAPER_SIGNAL_RECEIVED", { signal });
            await this.executePaperTradeSignal(signal);
        }

        if (payload.action === 'LIVE_OPTION_TICK' && payload.ltp) {
            this.onOptionPriceTick(payload.ltp);
        }
    }

    /**
     * Step 2 & 3: Strike Resolution & Paper Order Execution via PaperOrderPlace
     */
    async executePaperTradeSignal(signal) {
        if (!signal || !signal.consensus) return;

        const signalType = String(signal.consensus).toUpperCase();
        if (signalType !== 'BUY' && signalType !== 'SELL') {
            console.log(`ℹ️ [PAPER ORDER MANAGER] Consensus is ${signalType}. No trade execution required.`);
            this.broadcastTelemetry("PAPER_SIGNAL_IGNORED_NO_ACTION", { signal });
            return;
        }

        // Active Trade Guard
        if (this.isOrderActive) {
            console.warn(`⚠️ [PAPER ORDER MANAGER GUARD] Paper Trade already active (${this.activePosition?.symbol}). Ignoring signal.`);
            this.broadcastTelemetry("PAPER_SIGNAL_IGNORED_ACTIVE_POSITION", { signal });
            return;
        }

        const spotPrice = Number(signal.entry || 23200);
        const optionType = (signalType === 'BUY') ? 'CE' : 'PE';

        // Step 2: Resolve Strike Price via SelectStrikePriceBasedOnBalance (using Virtual Balance)
        let strikeDetails;
        try {
            console.log(`🔍 [PAPER STRIKE SELECTOR] Resolving ${optionType} Strike for Spot ₹${spotPrice} with Virtual Balance ₹${this.virtualBalance}...`);
            strikeDetails = await this.strikeSelector.selectStrikeForPaperTrading(spotPrice, optionType, this.virtualBalance);
        } catch (err) {
            console.error(`❌ [PAPER STRIKE ERROR] Strike Selection Failed: ${err.message}`);
            this.broadcastTelemetry("PAPER_ORDER_FAILED_STRIKE_SELECTION", { error: err.message, signal });
            return;
        }

        if (this.virtualBalance < strikeDetails.requiredMargin) {
            console.error(`❌ [PAPER ORDER ERROR] Insufficient virtual balance ₹${this.virtualBalance} for required margin ₹${strikeDetails.requiredMargin}`);
            this.broadcastTelemetry("PAPER_ORDER_FAILED_INSUFFICIENT_MARGIN", { requiredMargin: strikeDetails.requiredMargin, availableBalance: this.virtualBalance });
            return;
        }

        // Step 3: Paper Order Execution via PaperOrderPlace
        try {
            const paperPos = this.paperOrderPlacer.placePaperOrder(strikeDetails, 15.0, 2.2);
            this.isOrderActive = true;
            this.activePosition = paperPos;
            this.virtualMarginUsed = strikeDetails.requiredMargin;

            this.broadcastTelemetry("PAPER_ORDER_PLACED", this.activePosition);
            this.startLiveTickTracking();
        } catch (err) {
            console.error(`❌ [PAPER ORDER PLACEMENT ERROR] ${err.message}`);
            this.broadcastTelemetry("PAPER_ORDER_FAILED_PLACEMENT", { error: err.message });
        }
    }

    /**
     * Live Option Strike Tick Tracking Loop using LiveTrackPnL
     */
    startLiveTickTracking() {
        this.stopLiveTickTracking();

        console.log(`📈 [PAPER TICK TRACKER] Starting Live Option LTP tracking via LiveTrackPnL for ${this.activePosition?.symbol}...`);
        this.liveTickTimer = setInterval(async () => {
            if (!this.isOrderActive || !this.activePosition) {
                this.stopLiveTickTracking();
                return;
            }

            try {
                const pos = this.activePosition;
                const liveLtp = await this.pnlTracker.fetchLiveOptionLtp(pos.strikePrice, pos.optionType, pos.securityId);
                if (liveLtp && liveLtp > 0) {
                    this.onOptionPriceTick(liveLtp);
                }
            } catch (err) {
                console.warn(`⚠️ [PAPER TICK TRACKER WARNING] Tick fetch error: ${err.message}`);
            }
        }, 1500);
    }

    stopLiveTickTracking() {
        if (this.liveTickTimer) {
            clearInterval(this.liveTickTimer);
            this.liveTickTimer = null;
        }
    }

    /**
     * Step 4 & 5: Live Option Price Ticks -> Paper PnL Tracking & Trailing SL
     */
    onOptionPriceTick(tickPrice) {
        if (!this.isOrderActive || !this.activePosition || !tickPrice || tickPrice <= 0) return;

        const currentLtp = Number(tickPrice.toFixed(2));
        const pos = this.activePosition;

        // Step 4: Live PnL Tracking via LiveTrackPnL
        const liveMetrics = this.pnlTracker.calculateLivePnL(pos, currentLtp);
        if (liveMetrics) {
            pos.currentLtp = liveMetrics.currentLtp;
            pos.unrealizedPnl = liveMetrics.unrealizedPnl;
            pos.pnlPercentage = liveMetrics.pnlPercentage;
            pos.highestPriceSeen = liveMetrics.highestPriceSeen;
        }

        // Step 5: Trailing SL Evaluation via TrailingSLManager
        const trailResult = this.trailManager.evaluateTrailingSL(pos, currentLtp);
        if (trailResult.slUpdated) {
            pos.currentTrailingSL = trailResult.newTrailingSL;
        }

        // Step 5: Check Exit Triggers (Target Hit or Trailing SL Hit)
        const exitReason = this.trailManager.checkExitTriggers(pos, currentLtp);
        if (exitReason) {
            this.closePaperPosition(exitReason);
            return;
        }

        // Step 6: Broadcast Live Telemetry Update
        this.broadcastTelemetry("PAPER_LIVE_TICK_UPDATE", pos);
    }

    /**
     * Close Active Paper Position & Calculate Virtual PnL via PaperOrderPlace
     */
    async closePaperPosition(reason = "MANUAL_EXIT") {
        if (!this.isOrderActive || !this.activePosition) return;
        this.stopLiveTickTracking();

        const pos = this.activePosition;

        // Delegate exit calculation to PaperOrderPlace
        const closedRecord = this.paperOrderPlacer.closePaperOrder(pos, reason);
        const netPnl = closedRecord.netPnl;

        // Update Virtual Balance & Summary
        this.todaySummary.totalTrades += 1;
        if (netPnl >= 0) this.todaySummary.wins += 1;
        else this.todaySummary.losses += 1;
        this.todaySummary.realizedPnl = Number((this.todaySummary.realizedPnl + netPnl).toFixed(2));
        this.virtualBalance = Number((this.virtualBalance + netPnl).toFixed(2));
        this.virtualMarginUsed = 0.0;

        this.paperJournal.addClosedTrade(closedRecord, this.virtualBalance, this.todaySummary, this.tradeHistory);
        this.broadcastTelemetry("PAPER_POSITION_CLOSED", closedRecord);

        // Reset Active State
        this.activePosition = null;
        this.isOrderActive = false;
    }

    /**
     * Broadcasts Paper Telemetry Packet over WebSocket to Paper Dashboard & WS Clients
     */
    broadcastTelemetry(event, data) {
        if (!this.wsManager || !this.wsManager.isConnected()) return;

        const winratePercent = this.todaySummary.totalTrades > 0 
            ? `${((this.todaySummary.wins / this.todaySummary.totalTrades) * 100).toFixed(1)}%` 
            : '0.0%';

        const summaryObject = {
            ...this.todaySummary,
            winratePercent
        };

        const telemetryPacket = {
            event,
            timestamp: Date.now(),
            balance: this.virtualBalance,
            account: {
                virtualBalance: this.virtualBalance,
                virtualMarginUsed: this.virtualMarginUsed,
                availableFunds: this.virtualBalance,
                marginUsed: this.virtualMarginUsed
            },
            activePosition: this.activePosition ? {
                mode: 'PAPER_TRADING',
                status: 'OPEN',
                symbol: this.activePosition.symbol,
                qty: this.activePosition.qty,
                entryPrice: this.activePosition.entryPrice,
                currentLtp: this.activePosition.currentLtp,
                initialSL: this.activePosition.initialSL,
                targetProfit: this.activePosition.targetProfit,
                unrealizedPnl: this.activePosition.unrealizedPnl,
                highestPriceSeen: this.activePosition.highestPriceSeen,
                trailingSL: this.activePosition.currentTrailingSL,
                ratioText: this.activePosition.currentRatioText || this.activePosition.rrRatioText
            } : null,
            summary: summaryObject,
            todaySummary: summaryObject,
            eventData: data
        };

        this.wsManager.sendMessage({
            type: 'PAPER_MONITOR_UPDATE',
            data: telemetryPacket
        });
    }

    /**
     * Auto-Cut Timer at 3:10 PM IST
     */
    scheduleAutoCut310() {
        const checkAutoCut = () => {
            const now = new Date();
            const istFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            const parts = istFormatter.formatToParts(now);
            let hours = 0, minutes = 0;
            for (const p of parts) {
                if (p.type === 'hour') hours = parseInt(p.value, 10);
                if (p.type === 'minute') minutes = parseInt(p.value, 10);
            }

            if ((hours === 15 && minutes >= 10) || hours > 15) {
                if (this.isOrderActive && this.activePosition) {
                    console.log('⏰ [PAPER ORDER MANAGER] 3:10 PM IST Auto-Cut Triggered!');
                    this.closePaperPosition("AUTO_CUT_310_PM");
                }
            }
        };

        this.autoCutTimer = setInterval(checkAutoCut, 60000);
    }
}

// Allow direct CLI execution when launched via main.js
if (require.main === module) {
    async function startPaperOrderManagerCLI() {
        try {
            const paperManager = new PaperOrderManager();
            await paperManager.init();
        } catch (err) {
            console.error(`❌ [PAPER ORDER MANAGER CLI ERROR] ${err.message}`);
        }
    }
    startPaperOrderManagerCLI();
}

module.exports = PaperOrderManager;
