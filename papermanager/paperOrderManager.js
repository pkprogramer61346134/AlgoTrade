const fs = require('fs');
const path = require('path');
const AlgoTradeWSClient = require('../server/wsClient');

const JOURNAL_PATH = path.join(__dirname, 'paper_journal.json');

/**
 * PAPER TRADING MANAGER
 * 
 * 1. Connects to WebSocket Server as "paperOrderManager".
 * 2. Listens for Consensus Signals from "consensusEngine".
 * 3. Paper Active Order Guard: Ignores incoming signals if a paper trade is already active.
 * 4. Virtual Funds & Strike Selector: Uses ₹100,000 virtual balance & selects ATM/ITM Option Strike.
 * 5. Realistic Slippage Simulator: Applies ±0.50 pts slippage on entry and exit.
 * 6. Premium SL & Trailing Engine: Calculates Option SL & trails SL progressively (1:1.5, 1:2.5, 1:3, 1:3.5, 1:4, 1:4.5, 1:5+).
 * 7. 1R Breathing Room: Prevents early exits from market noise/wicks.
 * 8. Journal Persistence: Persists paper trades and virtual balance to paper_journal.json.
 * 9. Live Telemetry Stream: Broadcasts live paper PnL, paper trailing SL levels, and trade summary over WebSocket to "monitorClient".
 * 10. 3:15 PM Auto-Cut: Automatically closes active paper position at market close.
 */
class PaperOrderManager {
    constructor(options = {}) {
        this.serverUrl = options.serverUrl || 'ws://localhost:8080';
        this.clientId = options.clientId || 'paperOrderManager';
        this.monitorClientTarget = options.monitorClientTarget || 'monitorClient';
        this.slippagePoints = options.slippagePoints || 0.50; // ±0.50 pts realistic slippage

        this.wsClient = null;

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

        // Trailing SL Steps
        this.trailingRatioSteps = [1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        
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

                // 1. Consensus Signal Event from consensusEngine
                if (payload && (payload.action === 'CONSENSUS_SIGNAL_RESPONSE' || payload.consensus)) {
                    this.handleConsensusSignal(payload.singleSignal || payload, msg.senderId);
                }

                // 2. Live Option Tick Update Event
                if (payload && payload.action === 'LIVE_OPTION_TICK') {
                    this.onOptionPriceTick(payload.ltp);
                }

                // 3. Live Spot Price Update Event
                if (payload && (payload.currentLtp || payload.spotPrice)) {
                    this.onSpotPriceTick(payload.currentLtp || payload.spotPrice);
                }
            }
        });

        // Schedule 3:15 PM auto-cut check
        this.scheduleAutoCut315();

        console.log(`✅ [PAPER MANAGER] Running & Listening for signals. Virtual Balance: ₹${this.virtualBalance}`);
    }

    /**
     * Step 1: Handles incoming Consensus Trading Signal from consensusEngine.js
     */
    async handleConsensusSignal(signal, senderId) {
        console.log(`\n📩 [PAPER MANAGER] Signal received from "${senderId}":`, signal.consensus || signal.type);

        // Paper Active Order Guard: Ignore new signals if a paper trade is already active
        if (this.isOrderActive || this.activePosition) {
            console.warn(`🔒 [PAPER MANAGER GUARD] Active paper trade is running (${this.activePosition.symbol}). IGNORING incoming signal!`);
            this.broadcastTelemetry("PAPER_SIGNAL_IGNORED_ACTIVE_POSITION", { reason: "Active paper position currently running", signal });
            return;
        }

        const signalType = signal.consensus || signal.type;
        if (!signalType || signalType === 'NO_SIGNAL' || signalType === 'NONE') {
            console.log('ℹ️ [PAPER MANAGER] Signal is NO_SIGNAL. Standing by.');
            return;
        }

        console.log(`⚡ [PAPER MANAGER] Valid ${signalType} signal approved! Proceeding to Virtual Option Strike Selection...`);
        await this.executePaperOrderEntry(signalType, signal);
    }

    /**
     * Step 2: Virtual Strike Selection & Paper Order Execution with Slippage
     */
    async executePaperOrderEntry(signalType, signal) {
        const spotPrice = signal.entry || 24500.0;
        const optionType = (signalType === 'BUY') ? 'CE' : 'PE';
        // In-The-Money (ITM) Strike Selection: Math.floor for CE, Math.ceil for PE
        const strikePrice = optionType === 'CE' ? Math.floor(spotPrice / 50) * 50 : Math.ceil(spotPrice / 50) * 50;
        const symbol = `NIFTY_${strikePrice}_${optionType}`;

        const basePremium = 120.0;
        // Realistic Slippage Simulator (+0.50 pts on entry)
        const entryPremium = Number((basePremium + this.slippagePoints).toFixed(2));
        const qty = 50; // 1 Lot Nifty
        const requiredMargin = entryPremium * qty;

        if (this.virtualBalance < requiredMargin) {
            console.error(`❌ [PAPER MANAGER] Insufficient virtual balance! Required: ₹${requiredMargin}, Available: ₹${this.virtualBalance}`);
            this.broadcastTelemetry("PAPER_ORDER_FAILED_FUNDS", { requiredMargin, availableBalance: this.virtualBalance });
            return;
        }

        // Calculate Option Premium SL & Target Profit (15 Premium Points Risk, 1:2.2 RR Target)
        const riskPoints = 15.0;
        const initialSL = Number((entryPremium - riskPoints).toFixed(2));
        const targetProfit = Number((entryPremium + (riskPoints * 2.2)).toFixed(2));

        // Create Active Paper Position State
        this.activePosition = {
            orderId: `PAPER_ORD_${Date.now()}`,
            mode: 'PAPER_TRADING',
            symbol,
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

        console.log(`✅ [PAPER MANAGER ENTRY] Virtual Order Executed!`);
        console.log(`   - Order ID: ${this.activePosition.orderId}`);
        console.log(`   - Contract: ${symbol}`);
        console.log(`   - Entry Premium (with +${this.slippagePoints} pts slippage): ₹${entryPremium}`);
        console.log(`   - Initial SL: ₹${initialSL} (Risk = ₹${riskPoints} / Lot)`);

        this.broadcastTelemetry("PAPER_POSITION_OPENED", this.activePosition);
    }

    /**
     * Handles spot price ticks and estimates live Option LTP based on Delta (~0.55)
     */
    onSpotPriceTick(spotPrice) {
        if (!this.isOrderActive || !this.activePosition || !spotPrice) return;
        const pos = this.activePosition;
        const entrySpot = pos.entrySpot || spotPrice;
        const spotDelta = spotPrice - entrySpot;
        const optionDelta = pos.optionType === 'CE' ? 0.55 : -0.55;
        const estimatedLtp = Number((pos.entryPrice + (spotDelta * optionDelta)).toFixed(2));
        const finalLtp = Math.max(1.0, estimatedLtp);
        this.onOptionPriceTick(finalLtp);
    }

    /**
     * Step 3: Live Price Tick Handler & Stepless Trailing SL Engine for Paper Trade
     */
    onOptionPriceTick(ltp) {
        if (!this.isOrderActive || !this.activePosition) return;

        const pos = this.activePosition;
        pos.currentLtp = Number(ltp.toFixed(2));

        // Calculate Unrealized PnL
        const pnlPerShare = pos.currentLtp - pos.entryPrice;
        pos.unrealizedPnl = Number((pnlPerShare * pos.qty).toFixed(2));

        // Update Peak Price Achieved
        if (pos.currentLtp > pos.highestPriceSeen) {
            pos.highestPriceSeen = pos.currentLtp;
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

                // 1R Breathing Room Buffer Formula:
                // Move Trailing SL to (MilestoneRatio - 1.0) * Risk
                const lockedRRatio = Math.max(0, milestoneRatio - 1.0);
                const newTrailingSL = Number((pos.entryPrice + (lockedRRatio * pos.riskPoints)).toFixed(2));

                if (newTrailingSL > pos.currentTrailingSL) {
                    const oldSL = pos.currentTrailingSL;
                    pos.currentTrailingSL = newTrailingSL;
                    console.log(`📈 [PAPER MANAGER TRAIL] Milestone ${pos.currentRatioText} Reached! Peak: ₹${pos.highestPriceSeen} | Trailing SL moved: ₹${oldSL} ➔ ₹${newTrailingSL} (Locked R:R: 1:${lockedRRatio})`);
                }
                break;
            }
        }

        // Broadcast real-time paper telemetry to monitorClient on screen
        this.broadcastTelemetry("PAPER_LIVE_TICK_UPDATE", this.activePosition);
    }

    /**
     * Step 4: Close Paper Position, Apply Exit Slippage, Record PnL & Save Journal
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
        console.log(`   - Peak Achieved: ₹${pos.highestPriceSeen} (Max R:R ${pos.currentRatioText})`);
        console.log(`   - Net Paper PnL: ${netPnl >= 0 ? '+' : ''}₹${netPnl}`);
        console.log(`   - Updated Virtual Balance: ₹${this.virtualBalance}`);
        console.log(`===========================================================`);

        // Broadcast final exit telemetry to monitorClient
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
     * 3:15 PM Auto-Cut Timer
     */
    scheduleAutoCut315() {
        const checkAutoCut = () => {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes();

            if ((hours === 15 && minutes >= 15) || hours > 15) {
                if (this.isOrderActive && this.activePosition) {
                    console.log('⏰ [PAPER MANAGER] 3:15 PM Auto-Cut Triggered!');
                    this.closePaperPosition("PAPER_AUTO_CUT_315_PM");
                }
            }
        };

        this.autoCutTimer = setInterval(checkAutoCut, 60000);
    }
}

// Allow direct execution via command line (node papermanager/paperOrderManager.js)
if (require.main === module) {
    async function runPaperManagerStandalone() {
        const paperManager = new PaperOrderManager();
        await paperManager.init();
    }

    runPaperManagerStandalone();
}

module.exports = PaperOrderManager;
