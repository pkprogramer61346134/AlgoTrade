const fs = require('fs');
const path = require('path');
const AlgoTradeWSClient = require('../server/wsClient');
const DhanOptionStrikeFetcher = require('../dhanAPI/optionStrikeFetcher');

const JOURNAL_PATH = path.join(__dirname, 'paper_journal.json');

/**
 * PAPER TRADING MANAGER
 * 
 * Flow:
 * 1. Signal Received -> Active Paper Order Guard Check
 * 2. Step 1: Strike Price Selection via Dhan API Option Chain based on Virtual Balance
 * 3. Step 2: Paper Trade Order Execution with Real Dhan Market Entry Price
 * 4. Step 3: Track Target Profit (TP) & Trailing SL via REAL Dhan Option Market Ticks (NO DELTA MATH)
 * 5. Clean, direct flow using 100% real Dhan market data.
 */
class PaperOrderManager {
    constructor(options = {}) {
        this.serverUrl = options.serverUrl || 'ws://localhost:8080';
        this.clientId = options.clientId || 'paperOrderManager';
        this.monitorClientTarget = options.monitorClientTarget || 'monitorClient';
        this.slippagePoints = options.slippagePoints || 0.50; // ±0.50 pts realistic slippage

        this.wsClient = null;
        this.strikeFetcher = new DhanOptionStrikeFetcher();

        // Paper Active Position State
        this.activePosition = null;
        this.isOrderActive = false;

        // Virtual Funds & Journal
        this.virtualBalance = 10000.0;
        this.virtualMarginUsed = 0.0;
        this.tradeHistory = [];
        this.todaySummary = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            realizedPnl: 0.0
        };

        // Trailing SL Steps (1:1.5, 1:2.5, 1:3, 1:3.5, 1:4, 1:4.5, 1:5+)
        this.trailingRatioSteps = [1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];

        // Telemetry Throttling Configuration (500ms smooth stream flow)
        this.lastTelemetryTime = 0;
        this.telemetryThrottleMs = 500;

        this.autoCutTimer = null;
        this.loadJournal();
    }

    /**
     * Loads saved paper journal & virtual balance from paper_journal.json
     */
    loadJournal() {
        try {
            if (fs.existsSync(JOURNAL_PATH)) {
                const data = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf-8'));
                this.virtualBalance = Number(data.virtualBalance) || 10000.0;
                this.todaySummary = data.todaySummary || this.todaySummary;
                this.tradeHistory = data.tradeHistory || [];
                console.log(`📖 [PAPER MANAGER] Loaded Paper Journal. Virtual Balance: ₹${this.virtualBalance}`);
            }
        } catch (e) {
            console.warn(`⚠️ [PAPER MANAGER] Could not load paper journal: ${e.message}`);
        }
    }

    /**
     * Saves paper journal & virtual balance to paper_journal.json
     */
    saveJournal() {
        try {
            const data = {
                virtualBalance: this.virtualBalance,
                todaySummary: this.todaySummary,
                tradeHistory: this.tradeHistory,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(JOURNAL_PATH, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`💾 [PAPER MANAGER] Paper Journal saved to ${JOURNAL_PATH}`);
        } catch (e) {
            console.error(`❌ [PAPER MANAGER] Failed to save paper journal: ${e.message}`);
        }
    }

    async init() {
        console.log('===========================================================');
        console.log('📝 [PAPER TRADING MANAGER] Initializing Virtual Order System...');
        console.log('===========================================================');

        // Connect to WebSocket Server
        this.wsClient = new AlgoTradeWSClient(this.clientId, this.serverUrl);
        await this.wsClient.connect();

        // Listen for Consensus Signals & Messages
        this.wsClient.onMessage((msg) => {
            if (msg.type === 'LIVE_NIFTY_TICK' && msg.ltp) {
                this.onSpotPriceTick(msg.ltp);
            }

            if (msg.type === 'FORWARD_MESSAGE') {
                const payload = msg.payload;

                // 1. Live Nifty Tick forwarded
                if (payload && (payload.type === 'LIVE_NIFTY_TICK' || payload.action === 'LIVE_NIFTY_TICK') && (payload.ltp || payload.currentLtp || payload.spotPrice)) {
                    this.onSpotPriceTick(payload.ltp || payload.currentLtp || payload.spotPrice);
                }

                // 2. Consensus Signal Event from consensusEngine
                if (payload && (payload.action === 'CONSENSUS_SIGNAL_RESPONSE' || payload.consensus)) {
                    this.handleConsensusSignal(payload.singleSignal || payload, msg.senderId);
                }

                // 3. Live Option Tick Update Event
                if (payload && payload.action === 'LIVE_OPTION_TICK' && payload.ltp) {
                    this.onOptionPriceTick(payload.ltp);
                }
            }
        });

        // Schedule 3:10 PM auto-cut check
        this.scheduleAutoCut310();

        // 500ms smooth telemetry stream flow
        setInterval(() => {
            this.broadcastTelemetry("PAPER_HEARTBEAT", null);
        }, 500);

        console.log(`✅ [PAPER MANAGER] Running & Listening. Virtual Balance: ₹${this.virtualBalance}`);
    }

    /**
     * Step 1: Handles incoming Consensus Signal from consensusEngine
     */
    async handleConsensusSignal(signal, senderId) {
        console.log(`\n📩 [PAPER MANAGER] Signal received from "${senderId}":`, signal.consensus || signal.type);

        // Guard: Ignore new signals if a paper trade is already active
        if (this.isOrderActive || this.activePosition) {
            console.warn(`🔒 [PAPER MANAGER GUARD] Active paper trade running (${this.activePosition.symbol}). Signal ignored!`);
            this.broadcastTelemetry("PAPER_SIGNAL_IGNORED_ACTIVE_POSITION", { reason: "Active paper position currently running", signal });
            return;
        }

        const signalType = signal.consensus || signal.type;
        if (!signalType || signalType === 'NO_SIGNAL' || signalType === 'NONE') {
            return;
        }

        console.log(`⚡ [PAPER MANAGER] Approved ${signalType} signal! Executing Paper Trade...`);
        await this.executePaperOrderEntry(signalType, signal);
    }

    /**
     * Step 2 & 3: Strike Selection & Paper Trade Execution via Real Dhan Market Option Chain
     */
    async executePaperOrderEntry(signalType, signal) {
        const spotPrice = Number(signal.entry || signal.spotPrice || signal.currentLtp || 0);
        if (!spotPrice || spotPrice <= 0) {
            console.error(`❌ [PAPER MANAGER ERROR] Invalid or missing spot price in signal.`);
            this.broadcastTelemetry("PAPER_ORDER_FAILED_INVALID_SPOT", { error: "Missing spot price in signal", signal });
            return;
        }

        const optionType = (signalType === 'BUY') ? 'CE' : 'PE';

        // Query Dhan API Option Chain for real strike price and live market price
        let optionDetails;
        try {
            console.log(`🔍 [PAPER MANAGER] Querying Dhan API Option Chain for Nifty spot ₹${spotPrice} (${optionType})...`);
            optionDetails = await this.strikeFetcher.resolveOptionStrike(spotPrice, optionType, this.virtualBalance);
        } catch (err) {
            console.error(`❌ [PAPER MANAGER DHAN OPTION CHAIN ERROR] ${err.message}`);
            this.broadcastTelemetry("PAPER_ORDER_FAILED_DHAN_CHAIN", { error: err.message, signal });
            return;
        }

        const symbol = optionDetails.symbol;
        const strikePrice = optionDetails.strikePrice;
        const basePremium = optionDetails.liveLtp;
        const securityId = optionDetails.securityId;

        // Realistic Slippage (+0.50 pts on entry)
        const entryPremium = Number((basePremium + this.slippagePoints).toFixed(2));
        const qty = 65; // 1 Lot Nifty = 65 Qty
        const requiredMargin = entryPremium * qty;

        if (this.virtualBalance < requiredMargin) {
            const errStr = `Required margin ₹${requiredMargin} exceeds available virtual balance ₹${this.virtualBalance}`;
            console.error(`❌ [PAPER MANAGER] ${errStr}`);
            this.broadcastTelemetry("PAPER_ORDER_FAILED_FUNDS", { requiredMargin, availableBalance: this.virtualBalance });
            return;
        }

        // Calculate Target Profit (TP: 1:2.2 RR) & Stop Loss (SL: 15 pts Risk)
        const riskPoints = 15.0;
        const rawSL = entryPremium - riskPoints;
        const initialSL = Number((rawSL > 0 ? rawSL : Math.max(0.50, entryPremium * 0.5)).toFixed(2));
        const targetProfit = Number((entryPremium + (riskPoints * 2.2)).toFixed(2));

        // Create Active Paper Position State
        this.activePosition = {
            orderId: `PAPER_ORD_${Date.now()}`,
            mode: 'PAPER_TRADING',
            symbol,
            securityId,
            optionType,
            strikePrice,
            qty,
            entrySpot: spotPrice,
            entryPrice: entryPremium,
            currentLtp: entryPremium,
            initialSL,
            currentTrailingSL: initialSL,
            targetProfit,
            highestPriceSeen: entryPremium,
            riskPoints,
            currentMilestoneIndex: -1,
            currentRatioText: '1:0',
            unrealizedPnl: 0.0,
            openedAt: new Date().toLocaleTimeString()
        };

        this.isOrderActive = true;
        this.virtualMarginUsed = requiredMargin;

        console.log(`===========================================================`);
        console.log(`✅ [PAPER MANAGER ENTRY EXECUTED]`);
        console.log(`   - Order ID: ${this.activePosition.orderId}`);
        console.log(`   - Symbol: ${symbol} (SecID: ${securityId})`);
        console.log(`   - Dhan Market LTP: ₹${basePremium} | Executed Entry (with +${this.slippagePoints} pts slippage): ₹${entryPremium}`);
        console.log(`   - Target Profit (TP): ₹${targetProfit}`);
        console.log(`   - Initial SL: ₹${initialSL} (Risk = ₹${riskPoints}/Lot)`);
        console.log(`===========================================================`);

        this.broadcastTelemetry("PAPER_POSITION_OPENED", this.activePosition);
    }

    /**
     * Handles live spot price ticks & fetches real Option LTP from Dhan API (NO DELTA MATH)
     */
    onSpotPriceTick(spotPrice) {
        if (!this.isOrderActive || !this.activePosition || !spotPrice) return;
        const pos = this.activePosition;

        // Fetch real option strike LTP directly from Dhan API (NO DELTA MATH)
        this.strikeFetcher.fetchLiveOptionLtp(pos.strikePrice, pos.optionType, pos.securityId)
            .then(realLtp => {
                if (realLtp && realLtp > 0 && this.isOrderActive && this.activePosition) {
                    this.onOptionPriceTick(realLtp);
                }
            })
            .catch(err => {
                this.broadcastTelemetry("PAPER_DHAN_OPTION_TICK_NOTICE", { error: err.message, position: pos.symbol });
            });
    }

    /**
     * Live Option Price Tick Handler & Stepless Trailing SL Engine for Paper Trade
     */
    onOptionPriceTick(ltp) {
        if (!this.isOrderActive || !this.activePosition || !ltp || ltp <= 0) return;

        const pos = this.activePosition;
        pos.currentLtp = Number(ltp.toFixed(2));

        // Calculate Real Unrealized Paper PnL
        const pnlPerShare = pos.currentLtp - pos.entryPrice;
        pos.unrealizedPnl = Number((pnlPerShare * pos.qty).toFixed(2));

        // Update Peak Price Achieved
        if (pos.currentLtp > pos.highestPriceSeen) {
            pos.highestPriceSeen = pos.currentLtp;
        }

        // Check Target Profit (TP) Hit (1:2.2 RR Target)
        if (pos.targetProfit && pos.currentLtp >= pos.targetProfit) {
            console.log(`🎯 [PAPER MANAGER EXIT] Paper Target Profit (TP) HIT! Price: ₹${pos.currentLtp} >= Target: ₹${pos.targetProfit}`);
            this.closePaperPosition("PAPER_TARGET_PROFIT_HIT");
            return;
        }

        // Check Trailing SL Hit
        if (pos.currentLtp <= pos.currentTrailingSL) {
            console.log(`🚨 [PAPER MANAGER EXIT] Paper Trailing SL HIT! Price: ₹${pos.currentLtp} <= Trailing SL: ₹${pos.currentTrailingSL}`);
            this.closePaperPosition("PAPER_TRAILING_SL_HIT");
            return;
        }

        // Evaluate Trailing SL Progression
        const gainedPoints = pos.highestPriceSeen - pos.entryPrice;
        const currentRRRatio = gainedPoints / pos.riskPoints;

        for (let i = this.trailingRatioSteps.length - 1; i >= 0; i--) {
            const milestoneRatio = this.trailingRatioSteps[i];
            if (currentRRRatio >= milestoneRatio && i > pos.currentMilestoneIndex) {
                pos.currentMilestoneIndex = i;
                pos.currentRatioText = `1:${milestoneRatio}`;

                // 1R Breathing Room Formula:
                const lockedRRatio = Math.max(0, milestoneRatio - 1.0);
                const newTrailingSL = Number((pos.entryPrice + (lockedRRatio * pos.riskPoints)).toFixed(2));

                if (newTrailingSL > pos.currentTrailingSL) {
                    const oldSL = pos.currentTrailingSL;
                    pos.currentTrailingSL = newTrailingSL;
                    console.log(`📈 [PAPER MANAGER TRAIL] Milestone ${pos.currentRatioText} Reached! Peak: ₹${pos.highestPriceSeen} | Trailing SL: ₹${oldSL} ➔ ₹${newTrailingSL}`);
                }
                break;
            }
        }

        // Broadcast real-time paper telemetry to monitor UI
        this.broadcastTelemetry("PAPER_LIVE_TICK_UPDATE", this.activePosition);
    }

    /**
     * Close Paper Position, Apply Exit Slippage, Record PnL & Save Journal
     */
    closePaperPosition(reason = "PAPER_MANUAL_EXIT") {
        if (!this.isOrderActive || !this.activePosition) return;

        const pos = this.activePosition;
        // Realistic Exit Slippage (-0.50 pts on exit)
        const exitPrice = Number((pos.currentLtp - this.slippagePoints).toFixed(2));
        const pnlPerShare = exitPrice - pos.entryPrice;
        const netPnl = Number((pnlPerShare * pos.qty).toFixed(2));

        // Update Summary Stats
        this.todaySummary.totalTrades += 1;
        if (netPnl >= 0) {
            this.todaySummary.wins += 1;
        } else {
            this.todaySummary.losses += 1;
        }
        this.todaySummary.realizedPnl = Number((this.todaySummary.realizedPnl + netPnl).toFixed(2));
        this.virtualBalance = Number((this.virtualBalance + netPnl).toFixed(2));
        this.virtualMarginUsed = 0.0;

        const closedRecord = {
            ...pos,
            exitPrice,
            slippageApplied: this.slippagePoints,
            netPnl,
            reason,
            closedAt: new Date().toLocaleTimeString()
        };

        this.tradeHistory.push(closedRecord);
        this.saveJournal();

        console.log(`===========================================================`);
        console.log(`🏁 [PAPER MANAGER POSITION CLOSED]`);
        console.log(`   - Reason: ${reason}`);
        console.log(`   - Contract: ${pos.symbol}`);
        console.log(`   - Entry: ₹${pos.entryPrice} | Exit (with -${this.slippagePoints} pts slippage): ₹${exitPrice}`);
        console.log(`   - Net Paper PnL: ${netPnl >= 0 ? '+' : ''}₹${netPnl}`);
        console.log(`   - Updated Virtual Balance: ₹${this.virtualBalance}`);
        console.log(`===========================================================`);

        // Broadcast final exit telemetry to monitor UI
        this.broadcastTelemetry("PAPER_POSITION_CLOSED", closedRecord);

        // Reset active position state
        this.activePosition = null;
        this.isOrderActive = false;
    }

    /**
     * Broadcasts live paper telemetry stats over WebSocket to "monitorClient"
     */
    broadcastTelemetry(event, data) {
        if (!this.wsClient || !this.wsClient.connected) return;

        const now = Date.now();
        const isCriticalEvent = event.includes('OPENED') || event.includes('CLOSED') || event.includes('FAILED') || event.includes('REJECTED');

        if (!isCriticalEvent && (now - this.lastTelemetryTime < this.telemetryThrottleMs)) {
            return; // Skip rapid updates to keep UI smooth and readable
        }
        this.lastTelemetryTime = now;

        const telemetryPacket = {
            event,
            timestamp: Date.now(),
            account: {
                virtualBalance: this.virtualBalance,
                virtualMarginUsed: this.virtualMarginUsed
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
                ratioText: this.activePosition.currentRatioText
            } : null,
            todaySummary: this.todaySummary,
            eventData: data
        };

        this.wsClient.sendMessage({
            type: 'PAPER_MONITOR_UPDATE',
            data: telemetryPacket
        }, this.monitorClientTarget);
    }

    /**
     * 3:10 PM Auto-Cut Timer
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
                    console.log('⏰ [PAPER MANAGER] 3:10 PM IST Auto-Cut Triggered!');
                    this.closePaperPosition("PAPER_AUTO_CUT_310_PM");
                }
            }
        };

        this.autoCutTimer = setInterval(checkAutoCut, 60000);
    }
}

// Allow direct execution via command line
if (require.main === module) {
    async function runPaperManagerStandalone() {
        const paperManager = new PaperOrderManager();
        await paperManager.init();
    }

    runPaperManagerStandalone();
}

module.exports = PaperOrderManager;
