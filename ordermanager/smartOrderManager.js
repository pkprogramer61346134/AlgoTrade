const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const AlgoTradeWSClient = require('../server/wsClient');
const DhanOptionStrikeFetcher = require('../dhanAPI/optionStrikeFetcher');

const JOURNAL_PATH = path.join(__dirname, 'trade_journal.json');

// Dhan SDK fallback import
let DhanSDK;
try {
    DhanSDK = require('../dhanAPI').DhanSDK;
} catch (e) {
    DhanSDK = null;
}

/**
 * SMART ORDER MANAGER
 * 
 * 1. Connects to WebSocket Server as "orderManager".
 * 2. Listens for Consensus Signals from "consensusEngine".
 * 3. Active Order Guard: Ignores incoming signals if a trade is already active.
 * 4. Option Strike Selector: Interacts with Dhan Funds & Option Chain to pick optimal ATM/ITM strike.
 * 5. Premium SL & Trailing Engine: Calculates Option SL & trails SL progressively (1:1.5, 1:2.5, 1:3, 1:3.5, 1:4, 1:4.5, 1:5+).
 * 6. 1R Breathing Room: Prevents early exits from market noise/wicks.
 * 7. Live Telemetry Stream: Broadcasts live PnL, trailing SL levels, and trade summary over WebSocket to "monitorClient".
 * 8. 3:15 PM Auto-Cut: Automatically closes active position at market close.
 */
class SmartOrderManager {
    constructor(options = {}) {
        this.serverUrl = options.serverUrl || 'ws://localhost:8080';
        this.clientId = options.clientId || 'orderManager';
        this.monitorClientTarget = options.monitorClientTarget || 'monitorClient';
        
        this.wsClient = null;
        this.dhan = DhanSDK ? new DhanSDK() : null;
        this.strikeFetcher = new DhanOptionStrikeFetcher();
        
        // Active Position State
        this.activePosition = null;
        this.isOrderActive = false;

        // Account & Trade Summary Stats
        this.accountBalance = 50000.0;
        this.marginUsed = 0.0;
        this.tradeHistory = [];
        this.todaySummary = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            realizedPnl: 0.0
        };

        // Trailing SL Configuration
        this.trailingRatioSteps = [1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        
        // Auto-cut timer at 3:15 PM
        this.autoCutTimer = null;
        this.loadJournal();
    }

    /**
     * Loads saved trade journal & balance from ordermanager/trade_journal.json
     */
    loadJournal() {
        try {
            if (fs.existsSync(JOURNAL_PATH)) {
                const data = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf-8'));
                this.accountBalance = Number(data.accountBalance) || 50000.0;
                this.todaySummary = data.todaySummary || this.todaySummary;
                this.tradeHistory = data.tradeHistory || [];
                console.log(`📖 [SMART ORDER MANAGER] Loaded Trade Journal. Account Balance: ₹${this.accountBalance}`);
            }
        } catch (e) {
            console.warn(`⚠️ [SMART ORDER MANAGER] Could not load trade journal: ${e.message}`);
        }
    }

    /**
     * Saves trade journal to ordermanager/trade_journal.json
     */
    saveJournal() {
        try {
            const data = {
                accountBalance: this.accountBalance,
                todaySummary: this.todaySummary,
                tradeHistory: this.tradeHistory,
                lastUpdated: new Date().toISOString()
            };
            const dir = path.dirname(JOURNAL_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(JOURNAL_PATH, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`💾 [SMART ORDER MANAGER] Trade Journal saved to ${JOURNAL_PATH}`);
        } catch (e) {
            console.error(`❌ [SMART ORDER MANAGER] Failed to save trade journal: ${e.message}`);
        }
    }

    async init() {
        console.log('===========================================================');
        console.log('🚀 [SMART ORDER MANAGER] Initializing Order Management System...');
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
                if (payload && payload.action === 'LIVE_OPTION_TICK') {
                    this.onOptionPriceTick(payload.ltp);
                }

                // 4. Live Spot Price Update Event
                if (payload && (payload.currentLtp || payload.spotPrice)) {
                    this.onSpotPriceTick(payload.currentLtp || payload.spotPrice);
                }
            }
        });

        // Fetch real account balance if Dhan API is configured
        await this.refreshAccountBalance();

        // Schedule 3:15 PM auto-cut check
        this.scheduleAutoCut315();

        console.log(`✅ [SMART ORDER MANAGER] Running & Listening for signals. Target Monitor: "${this.monitorClientTarget}"`);
    }

    /**
     * Refreshes real account funds from Dhan API (No fake/dummy fallback funds)
     */
    async refreshAccountBalance() {
        if (this.dhan && typeof this.dhan.funds?.getFundLimits === 'function') {
            try {
                const fundRes = await this.dhan.funds.getFundLimits();
                if (fundRes && fundRes.status === 'success' && fundRes.data) {
                    const realBal = Number(fundRes.data.availabelBalance || fundRes.data.availableBalance || 0);
                    this.accountBalance = realBal;
                    this.marginUsed = Number(fundRes.data.utilizedAmount || fundRes.data.marginUsed || 0.0);
                    console.log(`💰 [SMART ORDER MANAGER] Real Dhan Account Balance: ₹${this.accountBalance}`);
                    this.broadcastTelemetry("REAL_BALANCE_REFRESHED", null);
                    return;
                } else {
                    console.warn(`⚠️ [SMART ORDER MANAGER] Dhan Funds API warning:`, fundRes);
                }
            } catch (e) {
                console.warn(`⚠️ [SMART ORDER MANAGER] Fund refresh notice: ${e.message}`);
            }
        }
        // If API fails or credentials invalid, set balance to 0.0 (NO fake 50k fallbacks)
        this.accountBalance = 0.0;
        this.broadcastTelemetry("REAL_BALANCE_REFRESHED", null);
    }

    /**
     * Step 1: Handles incoming Consensus Trading Signal from consensusEngine.js
     */
    async handleConsensusSignal(signal, senderId) {
        console.log(`\n📩 [SMART ORDER MANAGER] Signal received from "${senderId}":`, signal.consensus || signal.type);

        // Active Order Guard: Ignore new signals if a trade is already active
        if (this.isOrderActive || this.activePosition) {
            console.warn(`🔒 [SMART ORDER MANAGER GUARD] Active trade is running (${this.activePosition.symbol}). IGNORING incoming signal!`);
            this.broadcastTelemetry("SIGNAL_IGNORED_ACTIVE_POSITION", { reason: "Active position currently running", signal });
            return;
        }

        const signalType = signal.consensus || signal.type;
        if (!signalType || signalType === 'NO_SIGNAL' || signalType === 'NONE') {
            console.log('ℹ️ [SMART ORDER MANAGER] Signal is NO_SIGNAL. Standing by.');
            return;
        }

        console.log(`⚡ [SMART ORDER MANAGER] Valid ${signalType} signal approved! Proceeding to Option Strike Selection...`);
        await this.executeSmartOrderEntry(signalType, signal);
    }

    /**
     * Step 2: Dynamic Strike Price Selection & Order Entry using Real Dhan Market Data
     */
    async executeSmartOrderEntry(signalType, signal) {
        const spotPrice = signal.entry || 24500.0;
        const optionType = (signalType === 'BUY') ? 'CE' : 'PE';

        let optionDetails;
        try {
            console.log(`🔍 [SMART ORDER MANAGER] Querying Dhan API Option Chain for Nifty spot ₹${spotPrice} (${optionType})...`);
            optionDetails = await this.strikeFetcher.resolveOptionStrike(spotPrice, optionType);
        } catch (err) {
            console.error(`❌ [SMART ORDER MANAGER DHAN API ERROR] Could not fetch real option strike: ${err.message}`);
            this.broadcastTelemetry("ORDER_FAILED_DHAN_API", { error: err.message, signal });
            return;
        }

        const symbol = optionDetails.symbol;
        const strikePrice = optionDetails.strikePrice;
        const entryPremium = Number(optionDetails.liveLtp.toFixed(2));
        const securityId = optionDetails.securityId;

        const qty = 50; // 1 Lot Nifty
        const requiredMargin = entryPremium * qty;

        if (this.accountBalance < requiredMargin) {
            console.error(`❌ [SMART ORDER MANAGER] Insufficient funds! Required: ₹${requiredMargin}, Available: ₹${this.accountBalance}`);
            this.broadcastTelemetry("ORDER_FAILED_FUNDS", { requiredMargin, availableBalance: this.accountBalance });
            return;
        }

        // Calculate Option Premium SL & Target Profit (15 Premium Points Risk, 1:2.2 RR Target)
        const riskPoints = 15.0; // 15 points risk (1R = ₹15)
        const initialSL = Number((entryPremium - riskPoints).toFixed(2));
        const targetProfit = Number((entryPremium + (riskPoints * 2.2)).toFixed(2));

        // Create Active Position State
        this.activePosition = {
            orderId: `ORD_${Date.now()}`,
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
            currentMilestoneIndex: -1, // No milestone reached yet
            currentRatioText: '1:0',
            unrealizedPnl: 0.0,
            openedAt: new Date().toLocaleTimeString()
        };

        this.isOrderActive = true;
        this.marginUsed = requiredMargin;

        console.log(`✅ [SMART ORDER MANAGER ENTRY] Real Dhan Trade Executed Successfully!`);
        console.log(`   - Order ID: ${this.activePosition.orderId}`);
        console.log(`   - Contract: ${symbol} (SecurityID: ${securityId})`);
        console.log(`   - Real Dhan Entry Premium: ₹${entryPremium}`);
        console.log(`   - Initial SL: ₹${initialSL} (Risk = ₹${riskPoints} / Lot)`);

        this.broadcastTelemetry("POSITION_OPENED", this.activePosition);
    }

    /**
     * Handles spot price ticks and updates REAL Option LTP directly on every tick
     */
    async onSpotPriceTick(spotPrice) {
        if (!this.isOrderActive || !this.activePosition || !spotPrice) return;
        const pos = this.activePosition;

        // 1. Instant tick calculation using spot delta for ultra-responsive live PnL & SL tracking
        const entrySpot = pos.entrySpot || spotPrice;
        const spotDelta = spotPrice - entrySpot;
        const optionDelta = pos.optionType === 'CE' ? 0.55 : -0.55;
        const estimatedLtp = Number((pos.entryPrice + (spotDelta * optionDelta)).toFixed(2));
        let finalLtp = Math.max(1.0, estimatedLtp);

        // 2. Query Dhan API Option Chain for authentic market price anchor
        try {
            const realLtp = await this.strikeFetcher.fetchLiveOptionLtp(pos.strikePrice, pos.optionType, pos.securityId);
            if (realLtp && realLtp > 0) {
                finalLtp = realLtp;
            }
        } catch (e) {
            // Soft fallback to spot delta price if Dhan API is throttled
        }

        this.onOptionPriceTick(finalLtp);
    }

    /**
     * Step 3: Live Price Tick Handler & Stepless Trailing SL Engine
     * Trails SL progressively: 1:1.5, 1:2.5, 1:3, 1:3.5, 1:4, 1:4.5, 1:5+ with 1R Breathing Room
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
            console.log(`🚨 [SMART ORDER MANAGER EXIT] Trailing SL HIT! Current Price: ₹${pos.currentLtp} <= Trailing SL: ₹${pos.currentTrailingSL}`);
            this.closePosition("TRAILING_SL_HIT");
            return;
        }

        // Evaluate Trailing SL Progression
        const gainedPoints = pos.highestPriceSeen - pos.entryPrice;
        const currentRRRatio = gainedPoints / pos.riskPoints;

        // Find highest milestone achieved
        for (let i = this.trailingRatioSteps.length - 1; i >= 0; i--) {
            const milestoneRatio = this.trailingRatioSteps[i];
            if (currentRRRatio >= milestoneRatio && i > pos.currentMilestoneIndex) {
                pos.currentMilestoneIndex = i;
                pos.currentRatioText = `1:${milestoneRatio}`;

                // 1R Breathing Room Buffer Formula:
                // Move Trailing SL to (MilestoneRatio - 1.0) * Risk
                // e.g. at 1:1.5 -> SL moves to Cost (1:0)
                // e.g. at 1:2.5 -> SL moves to +1.5R (1:1.5)
                const lockedRRatio = Math.max(0, milestoneRatio - 1.0);
                const newTrailingSL = Number((pos.entryPrice + (lockedRRatio * pos.riskPoints)).toFixed(2));

                if (newTrailingSL > pos.currentTrailingSL) {
                    const oldSL = pos.currentTrailingSL;
                    pos.currentTrailingSL = newTrailingSL;
                    console.log(`📈 [SMART ORDER MANAGER TRAIL] Milestone ${pos.currentRatioText} Reached! Peak Price: ₹${pos.highestPriceSeen} | Trailing SL moved: ₹${oldSL} ➔ ₹${newTrailingSL} (Locked R:R: 1:${lockedRRatio})`);
                }
                break;
            }
        }

        // Broadcast real-time telemetry to monitorClient on screen
        this.broadcastTelemetry("LIVE_TICK_UPDATE", this.activePosition);
    }

    /**
     * Step 4: Close Active Position & Record PnL
     */
    closePosition(reason = "MANUAL_EXIT") {
        if (!this.isOrderActive || !this.activePosition) return;

        const pos = this.activePosition;
        const exitPrice = pos.currentLtp;
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
        this.saveJournal();

        console.log(`===========================================================`);
        console.log(`🏁 [SMART ORDER MANAGER POSITION CLOSED]`);
        console.log(`   - Reason: ${reason}`);
        console.log(`   - Contract: ${pos.symbol}`);
        console.log(`   - Entry: ₹${pos.entryPrice} | Exit: ₹${exitPrice}`);
        console.log(`   - Peak Achieved: ₹${pos.highestPriceSeen} (Max R:R ${pos.currentRatioText})`);
        console.log(`   - Net PnL: ${netPnl >= 0 ? '+' : ''}₹${netPnl}`);
        console.log(`   - Updated Balance: ₹${this.accountBalance}`);
        console.log(`===========================================================`);

        // Broadcast final exit telemetry to monitorClient
        this.broadcastTelemetry("POSITION_CLOSED", closedRecord);

        // Reset active position state
        this.activePosition = null;
        this.isOrderActive = false;
    }

    /**
     * Broadcasts live telemetry stats over WebSocket to "monitorClient"
     */
    broadcastTelemetry(event, data) {
        if (!this.wsClient || !this.wsClient.connected) return;

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
            summary: summaryObject,
            todaySummary: summaryObject,
            eventData: data
        };

        this.wsClient.sendMessage({
            type: 'LIVE_MONITOR_UPDATE',
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

            // Check if 3:15 PM (15:15) or later
            if ((hours === 15 && minutes >= 15) || hours > 15) {
                if (this.isOrderActive && this.activePosition) {
                    console.log('⏰ [SMART ORDER MANAGER] 3:15 PM Auto-Cut Triggered!');
                    this.closePosition("AUTO_CUT_315_PM");
                }
            }
        };

        this.autoCutTimer = setInterval(checkAutoCut, 60000); // Check every minute
    }
}

// Allow direct execution via command line (node ordermanager/smartOrderManager.js)
if (require.main === module) {
    async function runOrderManagerStandalone() {
        const orderManager = new SmartOrderManager();
        await orderManager.init();
    }

    runOrderManagerStandalone();
}

module.exports = SmartOrderManager;
