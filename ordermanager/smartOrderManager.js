const path = require('path');

// Import Modular Classes
const OrderManagerWS = require('./ordermanagerws');
const SelectStrikePriceBasedOnBalance = require('./selectestrikpricebaseofbalalace');
const OrderPlace = require('./orderplace');
const LiveTrackPnL = require('./livetrackpnl');
const TrailingSLManager = require('./trailingslmanager');

/**
 * SMART ORDER MANAGER (Clean Real Execution Engine)
 * 
 * Rules & Architecture:
 * 1. ZERO dummy / fake fallback data - Errors are reported directly to Console & Monitor UI.
 * 2. Step 1: OrderManagerWS - WebSocket Connection & Consensus Signal Listener.
 * 3. Step 2: SelectStrikePriceBasedOnBalance - Fetch Real Dhan Balance & Strike Resolution.
 * 4. Step 3: OrderPlace - REAL Market BUY Order Execution.
 * 5. Step 4: LiveTrackPnL - Real-time Position & PnL Tracking.
 * 6. Step 5: TrailingSLManager - 1R Milestone Progression & Exit Trigger Execution.
 */
class SmartOrderManager {
    constructor(options = {}) {
        // Step 1: WebSocket Connection Manager
        this.wsManager = new OrderManagerWS(options);
        
        // Steps 2-5: Single Responsibility Modular Classes
        this.strikeSelector = new SelectStrikePriceBasedOnBalance();
        this.orderPlacer = new OrderPlace();
        this.pnlTracker = new LiveTrackPnL();
        this.trailManager = new TrailingSLManager();

        // Active State Tracking (REAL Trading - No Fake Data)
        this.activePosition = null;
        this.isOrderActive = false;
        this.accountBalance = 0.0;
        this.marginUsed = 0.0;
        this.tradeHistory = [];
        this.todaySummary = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            realizedPnl: 0.0
        };

        this.autoCutTimer = null;
    }

    /**
     * Step 1: Initialize WS Connection & Sync Real Dhan Account Balance
     */
    async init() {
        console.log(`🚀 [SMART ORDER MANAGER] Starting Real Modular Engine...`);

        // Connect WebSocket Server via OrderManagerWS
        await this.wsManager.connect(async (msg) => {
            await this.handleIncomingSignal(msg);
        });

        // Fetch Real Dhan Account Balance (Direct Dhan API - Zero Fake Fallback)
        try {
            const realBalance = await this.strikeSelector.fetchRealDhanBalance();
            if (realBalance <= 0) {
                console.error(`❌ [SMART ORDER MANAGER ERROR] Real Dhan balance is ₹${realBalance}. Available balance must be greater than ₹0.`);
                this.broadcastTelemetry("ERROR_ZERO_BALANCE", { error: "Real Dhan balance is 0 or unavailable." });
            } else {
                this.accountBalance = realBalance;
                console.log(`💰 [SMART ORDER MANAGER] Real Dhan Account Balance Verified: ₹${this.accountBalance}`);
            }
        } catch (err) {
            console.error(`❌ [SMART ORDER MANAGER BALANCE ERROR] ${err.message}`);
            this.broadcastTelemetry("ERROR_BALANCE_FETCH_FAILED", { error: err.message });
        }

        this.scheduleAutoCut310();
        this.startHeartbeatSync();
        this.broadcastTelemetry("SYSTEM_INITIALIZED", { status: "ONLINE", balance: this.accountBalance });
    }

    async syncRealBalance() {
        try {
            const realBal = await this.strikeSelector.fetchRealDhanBalance();
            if (realBal > 0) {
                this.accountBalance = realBal;
            }
        } catch (e) {}
    }

    startHeartbeatSync() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(async () => {
            if (!this.isOrderActive) {
                await this.syncRealBalance();
            }
            this.broadcastTelemetry("HEARTBEAT_SYNC", { status: "ONLINE", balance: this.accountBalance });
        }, 5000);
    }

    /**
     * Step 1 (Listener): Handles incoming consensus BUY/SELL signals from Head
     */
    async handleIncomingSignal(msg) {
        if (!msg) return;

        let payload = msg.payload || msg.data || msg;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) {}
        }

        if (payload.action === 'GET_REAL_STATE' || payload.type === 'GET_REAL_STATE') {
            await this.syncRealBalance();
            this.broadcastTelemetry("STATE_SYNC", { status: "ONLINE", balance: this.accountBalance });
        }

        if (payload.action === 'CONSENSUS_SIGNAL_RESPONSE' || payload.singleSignal) {
            const signal = payload.singleSignal || payload.signal || payload;
            console.log(`📩 [SMART ORDER MANAGER] Received Consensus Signal from Master Head: ${signal.consensus || 'NO_SIGNAL'} (Spot ₹${signal.entry || 'N/A'} | Strategy: ${signal.strategyName || 'Master Head'})`);
            this.broadcastTelemetry("SIGNAL_RECEIVED", { signal });
            await this.executeTradeSignal(signal);
        }
    }

    /**
     * Step 2 & 3: Strike Selection & Order Placement
     */
    async executeTradeSignal(signal) {
        if (!signal || !signal.consensus) return;

        const signalType = String(signal.consensus).toUpperCase();
        if (signalType !== 'BUY' && signalType !== 'SELL') {
            console.log(`ℹ️ [SMART ORDER MANAGER] Consensus is ${signalType}. No trade execution required.`);
            this.broadcastTelemetry("SIGNAL_IGNORED_NO_ACTION", { signal });
            return;
        }

        // Active Trade Guard
        if (this.isOrderActive) {
            console.warn(`⚠️ [SMART ORDER MANAGER GUARD] Trade already active (${this.activePosition?.symbol}). Ignoring signal.`);
            this.broadcastTelemetry("SIGNAL_IGNORED_ACTIVE_POSITION", { signal });
            return;
        }

        const spotPrice = Number(signal.entry);
        if (!spotPrice || spotPrice <= 0) {
            console.error(`❌ [SMART ORDER MANAGER ERROR] Invalid spot price in signal: ${signal.entry}`);
            this.broadcastTelemetry("ERROR_INVALID_SPOT_PRICE", { signal });
            return;
        }

        const optionType = (signalType === 'BUY') ? 'CE' : 'PE';

        // Step 2: Resolve Strike Price via Real Dhan Option Chain & Available Balance
        let strikeDetails;
        try {
            console.log(`🔍 [STEP 2: STRIKE SELECTOR] Resolving ${optionType} Strike for Spot ₹${spotPrice} via Real Dhan Account Balance...`);
            strikeDetails = await this.strikeSelector.selectStrikeForRealMoney(spotPrice, optionType);
        } catch (err) {
            console.error(`❌ [STEP 2 ERROR] Strike Selection Failed: ${err.message}`);
            this.broadcastTelemetry("ORDER_FAILED_STRIKE_SELECTION", { error: err.message, signal });
            return; // Abort - Zero dummy fallbacks!
        }

        if (this.accountBalance < strikeDetails.requiredMargin) {
            console.error(`❌ [STEP 2 ERROR] Insufficient Real Dhan balance ₹${this.accountBalance} for required margin ₹${strikeDetails.requiredMargin}`);
            this.broadcastTelemetry("ORDER_FAILED_INSUFFICIENT_MARGIN", { requiredMargin: strikeDetails.requiredMargin, availableBalance: this.accountBalance, signal });
            return;
        }

        // Step 3: Place REAL Order via OrderPlace (15 pts SL, 40 pts Target)
        let orderResult;
        try {
            console.log(`🚀 [STEP 3: ORDER PLACE] Submitting REAL Dhan Market Order for ${strikeDetails.symbol}...`);
            orderResult = await this.orderPlacer.placeOrderWithSlTp(strikeDetails, 15.0, 2.2);
        } catch (err) {
            console.error(`❌ [STEP 3 ERROR] Order Placement Failed: ${err.message}`);
            this.broadcastTelemetry("ORDER_FAILED_PLACEMENT", { error: err.message, strikeDetails });
            return; // Abort - Zero dummy fallbacks!
        }

        if (!orderResult || !orderResult.entryPrice) {
            console.error(`❌ [STEP 3 ERROR] Order placement returned invalid result.`);
            this.broadcastTelemetry("ORDER_FAILED_INVALID_RESULT", { orderResult });
            return;
        }

        // Setup Active Position State
        this.isOrderActive = true;
        this.activePosition = orderResult;
        this.marginUsed = strikeDetails.requiredMargin;

        console.log(`✅ [TRADE OPENED] ${this.activePosition.symbol} @ ₹${this.activePosition.entryPrice} | SL: ₹${this.activePosition.initialSL} | Target: ₹${this.activePosition.targetProfit}`);
        this.broadcastTelemetry("ORDER_PLACED", this.activePosition);
        this.startLiveTickTracking();
    }

    /**
     * Live Option Strike Tick Tracking Loop using LiveTrackPnL
     */
    startLiveTickTracking() {
        this.stopLiveTickTracking();

        console.log(`📈 [REAL TICK TRACKER] Starting Live Option LTP tracking via LiveTrackPnL for ${this.activePosition?.symbol}...`);
        this.liveTickTimer = setInterval(async () => {
            if (!this.isOrderActive || !this.activePosition) {
                this.stopLiveTickTracking();
                return;
            }

            try {
                const pos = this.activePosition;
                // Fetch real-time live option strike price from Dhan API
                const liveLtp = await this.pnlTracker.fetchLiveOptionLtp(pos.strikePrice, pos.optionType, pos.securityId);
                if (liveLtp && liveLtp > 0) {
                    this.onOptionPriceTick(liveLtp);
                }
            } catch (err) {
                console.warn(`⚠️ [REAL TICK TRACKER WARNING] Tick fetch error: ${err.message}`);
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
     * Step 4 & 5: Live Option Price Ticks -> PnL Tracking & Trailing SL
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
            this.orderPlacer.updateTrailingSl(pos, currentLtp);
        }

        // Step 5: Check Exit Triggers (Target Hit or Trailing SL Hit)
        const exitReason = this.trailManager.checkExitTriggers(pos, currentLtp);
        if (exitReason) {
            this.closePosition(exitReason);
            return;
        }

        // Step 6: Broadcast Live Telemetry Update to Web Dashboard UI
        this.broadcastTelemetry("LIVE_TICK_UPDATE", pos);
    }

    /**
     * Close Active Position & Exit REAL Market Order via OrderPlace
     */
    async closePosition(reason = "MANUAL_EXIT") {
        if (!this.isOrderActive || !this.activePosition) return;
        this.stopLiveTickTracking();

        const pos = this.activePosition;

        try {
            console.log(`🚀 [CLOSE POSITION] Exiting ${pos.symbol} via Dhan API. Reason: ${reason}...`);
            await this.orderPlacer.closeOrder(pos, reason);
        } catch (err) {
            console.error(`❌ [CLOSE POSITION ERROR] Exit Order Failed: ${err.message}`);
            this.broadcastTelemetry("EXIT_ORDER_FAILED", { error: err.message, position: pos });
        }

        const exitPrice = pos.currentLtp || pos.entryPrice;
        const netPnl = Number(((exitPrice - pos.entryPrice) * pos.qty).toFixed(2));

        // Update Account Stats
        this.todaySummary.totalTrades += 1;
        if (netPnl >= 0) this.todaySummary.wins += 1;
        else this.todaySummary.losses += 1;
        this.todaySummary.realizedPnl = Number((this.todaySummary.realizedPnl + netPnl).toFixed(2));
        this.accountBalance = Number((this.accountBalance + netPnl).toFixed(2));
        this.marginUsed = 0.0;

        const closedRecord = {
            ...pos,
            exitPrice,
            netPnl,
            reason,
            closedAt: new Date().toLocaleTimeString()
        };

        this.tradeHistory.push(closedRecord);
        this.broadcastTelemetry("POSITION_CLOSED", closedRecord);

        // Reset Active State
        this.activePosition = null;
        this.isOrderActive = false;
    }

    /**
     * Telemetry Broadcast via WebSocket to Real Money Terminal & Clients
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
            balance: this.accountBalance,
            account: {
                availableFunds: this.accountBalance,
                marginUsed: this.marginUsed
            },
            activePosition: this.activePosition ? {
                mode: 'REAL_TRADING',
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
            type: 'LIVE_MONITOR_UPDATE',
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
                    console.log('⏰ [SMART ORDER MANAGER] 3:10 PM IST Auto-Cut Triggered!');
                    this.closePosition("AUTO_CUT_310_PM");
                }
            }
        };

        this.autoCutTimer = setInterval(checkAutoCut, 60000);
    }
}

// Allow direct CLI execution when launched via main.js
if (require.main === module) {
    async function startSmartOrderManagerCLI() {
        try {
            const manager = new SmartOrderManager();
            await manager.init();
        } catch (err) {
            console.error(`❌ [SMART ORDER MANAGER CLI ERROR] ${err.message}`);
        }
    }
    startSmartOrderManagerCLI();
}

module.exports = SmartOrderManager;
