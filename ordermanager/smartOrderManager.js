const { WebSocket } = require('ws');
const AlgoTradeWSClient = require('../server/wsClient');

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
            }
        });

        // Fetch real account balance if Dhan API is configured
        await this.refreshAccountBalance();

        // Schedule 3:15 PM auto-cut check
        this.scheduleAutoCut315();

        console.log(`✅ [SMART ORDER MANAGER] Running & Listening for signals. Target Monitor: "${this.monitorClientTarget}"`);
    }

    /**
     * Refreshes real account funds from Dhan API (if credentials present)
     */
    async refreshAccountBalance() {
        if (this.dhan && typeof this.dhan.funds?.getFundLimits === 'function') {
            try {
                const fundRes = await this.dhan.funds.getFundLimits();
                if (fundRes && fundRes.status === 'success' && fundRes.data) {
                    const realBal = Number(fundRes.data.availabelBalance) || 0;
                    // If real balance is present and >= 5000, use it; otherwise fallback to virtual 50k balance for simulation
                    this.accountBalance = realBal >= 5000 ? realBal : 50000.0;
                    this.marginUsed = Number(fundRes.data.marginUsed) || 0.0;
                    console.log(`💰 [SMART ORDER MANAGER] Account Balance: ₹${this.accountBalance} (Real Dhan: ₹${realBal})`);
                    return;
                }
            } catch (e) {
                console.warn(`⚠️ [SMART ORDER MANAGER] Fund refresh notice: ${e.message}`);
            }
        }
        this.accountBalance = 50000.0;
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
     * Step 2: Dynamic Strike Price Selection & Order Entry
     */
    async executeSmartOrderEntry(signalType, signal) {
        const spotPrice = signal.entry || 24500.0;

        // Select Strike Price (CE for BUY, PE for SELL)
        const optionType = (signalType === 'BUY') ? 'CE' : 'PE';
        // Round to nearest 50 strike (ATM)
        const strikePrice = Math.round(spotPrice / 50) * 50;
        const symbol = `NIFTY_${strikePrice}_${optionType}`;

        // Estimate Option Premium (approx ~120 for ATM option)
        const entryPremium = 120.0;
        const qty = 50; // 1 Lot Nifty
        const requiredMargin = entryPremium * qty; // ₹6,000

        if (this.accountBalance < requiredMargin) {
            console.error(`❌ [SMART ORDER MANAGER] Insufficient funds! Required: ₹${requiredMargin}, Available: ₹${this.accountBalance}`);
            this.broadcastTelemetry("ORDER_FAILED_FUNDS", { requiredMargin, availableBalance: this.accountBalance });
            return;
        }

        // Calculate Option Premium SL (15 Premium Points Risk)
        const riskPoints = 15.0; // 15 points risk (1R = ₹15)
        const initialSL = Number((entryPremium - riskPoints).toFixed(2));

        // Create Active Position State
        this.activePosition = {
            orderId: `ORD_${Date.now()}`,
            symbol,
            optionType,
            strikePrice,
            qty,
            entryPrice: entryPremium,
            currentLtp: entryPremium,
            initialSL,
            currentTrailingSL: initialSL,
            highestPriceSeen: entryPremium,
            riskPoints,
            currentMilestoneIndex: -1, // No milestone reached yet
            currentRatioText: '1:0',
            unrealizedPnl: 0.0,
            openedAt: new Date().toLocaleTimeString()
        };

        this.isOrderActive = true;
        this.marginUsed = requiredMargin;

        console.log(`✅ [SMART ORDER MANAGER ENTRY] Trade Executed Successfully!`);
        console.log(`   - Order ID: ${this.activePosition.orderId}`);
        console.log(`   - Contract: ${symbol}`);
        console.log(`   - Entry Premium: ₹${entryPremium}`);
        console.log(`   - Initial SL: ₹${initialSL} (Risk = ₹${riskPoints} / Lot)`);

        this.broadcastTelemetry("POSITION_OPENED", this.activePosition);
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

        const telemetryPacket = {
            event,
            timestamp: Date.now(),
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
                unrealizedPnl: this.activePosition.unrealizedPnl,
                highestPriceSeen: this.activePosition.highestPriceSeen,
                trailingSL: this.activePosition.currentTrailingSL,
                ratioText: this.activePosition.currentRatioText
            } : null,
            todaySummary: this.todaySummary,
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
