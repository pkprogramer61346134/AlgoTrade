const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const AlgoTradeWSClient = require('../server/wsClient');
const DhanOptionStrikeFetcher = require('../dhanAPI/optionStrikeFetcher');

const JOURNAL_PATH = path.join(__dirname, 'trade_journal.json');

// Dhan SDK import
let DhanSDK;
try {
    DhanSDK = require('../dhanAPI').DhanSDK;
} catch (e) {
    DhanSDK = null;
}

/**
 * SMART ORDER MANAGER (Real Dhan API Execution Engine)
 * 
 * Flow:
 * 1. Signal Received -> Guard check (Active position & REAL routing mode)
 * 2. Step 1: Check Real Dhan Account Balance
 * 3. Step 2: Strike Selection via Dhan Option Chain based on Available Balance
 * 4. Step 3: REAL Market BUY Order via Dhan API
 * 5. Track Target Profit (TP) & Trailing SL via Real Dhan Option Ticks & Position Sync
 * 6. Zero dummy data, zero fake fallbacks - Errors broadcasted directly to Monitor UI
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
        this.accountBalance = 0.0;
        this.marginUsed = 0.0;
        this.tradeHistory = [];
        this.todaySummary = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            realizedPnl: 0.0
        };

        // Trailing SL Configuration Steps (1:1.5, 1:2.5, 1:3, 1:3.5, 1:4, 1:4.5, 1:5+)
        this.trailingRatioSteps = [1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        
        // Telemetry Throttling Configuration (2 Seconds smooth refresh rate)
        this.lastTelemetryTime = 0;
        this.telemetryThrottleMs = 2000;

        // Auto-cut timer at 3:10 PM IST
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
                this.accountBalance = Number(data.accountBalance) || 0.0;
                this.todaySummary = data.todaySummary || this.todaySummary;
                this.tradeHistory = data.tradeHistory || [];
                console.log(`📖 [SMART ORDER MANAGER] Loaded Trade Journal. Balance: ₹${this.accountBalance}`);
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
            console.log(`💾 [SMART ORDER MANAGER] Journal saved to ${JOURNAL_PATH}`);
        } catch (e) {
            console.error(`❌ [SMART ORDER MANAGER] Failed to save journal: ${e.message}`);
        }
    }

    async init() {
        console.log('===========================================================');
        console.log('🚀 [SMART ORDER MANAGER] Initializing Real Dhan Order Management System...');
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

        // Step 1: Refresh real account balance from Dhan API
        await this.refreshAccountBalance();

        // Schedule 3:10 PM auto-cut check
        this.scheduleAutoCut310();

        // Telemetry heartbeat broadcast every 500ms for UI monitor
        // 2-second periodic telemetry heartbeat broadcast for smooth UI without flickering
        setInterval(() => {
            this.broadcastTelemetry("HEARTBEAT", null);
        }, 2000);

        console.log(`✅ [SMART ORDER MANAGER] Running & Listening. Target Monitor: "${this.monitorClientTarget}"`);
    }

    /**
     * Step 1: Refreshes real account funds directly from Dhan API.
     * Broadcasts error to monitor if Dhan API fails.
     */
    async refreshAccountBalance() {
        if (this.dhan && typeof this.dhan.funds?.getFundLimits === 'function') {
            try {
                const fundRes = await this.dhan.funds.getFundLimits();
                if (fundRes && fundRes.status === 'success' && fundRes.data) {
                    const realBal = Number(fundRes.data.availabelBalance || fundRes.data.availableBalance || 0);
                    if (realBal > 0) {
                        this.accountBalance = realBal;
                    }
                    this.marginUsed = Number(fundRes.data.utilizedAmount || fundRes.data.marginUsed || 0.0);
                    console.log(`💰 [SMART ORDER MANAGER] Real Dhan Balance: ₹${this.accountBalance}`);
                    await this.syncDhanLivePosition();
                    this.broadcastTelemetry("REAL_BALANCE_REFRESHED", null);
                    return;
                } else {
                    const errMsg = fundRes?.message || 'Dhan Funds API returned invalid response';
                    console.warn(`⚠️ [SMART ORDER MANAGER] Dhan Funds Notice: ${errMsg}`);
                    this.broadcastTelemetry("DHAN_FUNDS_ERROR", { error: errMsg, response: fundRes });
                }
            } catch (e) {
                console.error(`❌ [SMART ORDER MANAGER] Dhan Funds Exception: ${e.message}`);
                this.broadcastTelemetry("DHAN_FUNDS_EXCEPTION", { error: e.message });
            }
        }
        this.broadcastTelemetry("REAL_BALANCE_REFRESHED", null);
    }

    /**
     * Handles incoming Consensus Signal
     */
    async handleConsensusSignal(signal, senderId) {
        console.log(`\n📩 [SMART ORDER MANAGER] Signal received from "${senderId}":`, signal.consensus || signal.type);

        // Guard 1: Skip if system routing mode is not REAL or BOTH
        if (signal.routingMode && signal.routingMode !== 'REAL' && signal.routingMode !== 'BOTH') {
            console.warn(`🔒 [SMART ORDER MANAGER GUARD] Signal routing mode is "${signal.routingMode}". Real order execution skipped.`);
            return;
        }

        // Guard 2: Skip if trade is already active
        if (this.isOrderActive || this.activePosition) {
            console.warn(`🔒 [SMART ORDER MANAGER GUARD] Active trade running (${this.activePosition.symbol}). Signal ignored!`);
            this.broadcastTelemetry("SIGNAL_IGNORED_ACTIVE_POSITION", { reason: "Active position currently running", signal });
            return;
        }

        const signalType = signal.consensus || signal.type;
        if (!signalType || signalType === 'NO_SIGNAL' || signalType === 'NONE') {
            return;
        }

        console.log(`⚡ [SMART ORDER MANAGER] Approved ${signalType} signal! Executing Real Dhan Trade...`);
        await this.executeSmartOrderEntry(signalType, signal);
    }

    /**
     * Step 2 & 3: Strike Selection & REAL Dhan Market BUY Order Execution
     */
    async executeSmartOrderEntry(signalType, signal) {
        const spotPrice = Number(signal.entry || signal.spotPrice || signal.currentLtp || 0);
        if (!spotPrice || spotPrice <= 0) {
            const errStr = "Invalid or missing Nifty spot price in signal";
            console.error(`❌ [SMART ORDER MANAGER] ${errStr}`);
            this.broadcastTelemetry("ORDER_FAILED_INVALID_SPOT", { error: errStr, signal });
            return;
        }

        // Step 1 Check: Verify Real Dhan Account Balance
        await this.refreshAccountBalance();
        if (!this.accountBalance || this.accountBalance <= 0) {
            const errStr = `Insufficient Dhan funds (Balance: ₹${this.accountBalance})`;
            console.error(`❌ [SMART ORDER MANAGER] ${errStr}`);
            this.broadcastTelemetry("ORDER_FAILED_ZERO_BALANCE", { error: errStr, availableBalance: this.accountBalance });
            return;
        }

        const optionType = (signalType === 'BUY') ? 'CE' : 'PE';

        // Step 2 Check: Resolve Strike Price via Real Dhan Market Option Chain
        let optionDetails;
        try {
            console.log(`🔍 [SMART ORDER MANAGER] Resolving Dhan Option Strike for Spot ₹${spotPrice} (${optionType})...`);
            optionDetails = await this.strikeFetcher.resolveOptionStrike(spotPrice, optionType, this.accountBalance);
        } catch (err) {
            console.error(`❌ [SMART ORDER MANAGER DHAN OPTION CHAIN ERROR] ${err.message}`);
            this.broadcastTelemetry("ORDER_FAILED_DHAN_OPTION_CHAIN", { error: err.message, signal });
            return;
        }

        const symbol = optionDetails.symbol;
        const strikePrice = optionDetails.strikePrice;
        const entryPremium = Number(optionDetails.liveLtp.toFixed(2));
        const securityId = optionDetails.securityId;

        const qty = 65; // 1 Lot Nifty = 65 Qty
        const requiredMargin = entryPremium * qty;

        if (this.accountBalance < requiredMargin) {
            const errStr = `Required margin ₹${requiredMargin} exceeds available balance ₹${this.accountBalance}`;
            console.error(`❌ [SMART ORDER MANAGER] ${errStr}`);
            this.broadcastTelemetry("ORDER_FAILED_INSUFFICIENT_MARGIN", { requiredMargin, availableBalance: this.accountBalance });
            return;
        }

        // Step 3: Submit REAL Market BUY Order to Dhan API
        let realDhanOrderId = `ORD_${Date.now()}`;
        if (!this.dhan || typeof this.dhan.orders?.placeOrder !== 'function') {
            const errStr = "Dhan SDK uninitialized or placeOrder function unavailable";
            console.error(`❌ [SMART ORDER MANAGER] ${errStr}`);
            this.broadcastTelemetry("ORDER_FAILED_DHAN_SDK_MISSING", { error: errStr });
            return;
        }

        try {
            console.log(`🚀 [SMART ORDER MANAGER DHAN API] Submitting REAL Order for ${symbol} (SecID: ${securityId}, Qty: ${qty})...`);
            const realOrderResult = await this.dhan.orders.placeOrder({
                transactionType: 'BUY',
                exchangeSegment: 'NSE_FNO',
                productType: 'INTRADAY',
                orderType: 'MARKET',
                validity: 'DAY',
                securityId: String(securityId),
                quantity: qty,
                price: 0
            });

            console.log(`📩 [DHAN API RESPONSE]:`, JSON.stringify(realOrderResult, null, 2));

            if (realOrderResult && (realOrderResult.status === 'success' || realOrderResult.orderId || realOrderResult.data?.orderId)) {
                realDhanOrderId = realOrderResult.orderId || realOrderResult.data?.orderId || realDhanOrderId;
                console.log(`✅ [REAL DHAN ORDER EXECUTED] Order ID: ${realDhanOrderId}`);
            } else {
                const errMsg = realOrderResult?.errorData?.errorMessage || realOrderResult?.message || 'Dhan API BUY order rejected';
                console.error(`❌ [DHAN API ORDER REJECTED]: ${errMsg}`);
                this.broadcastTelemetry("REAL_ORDER_REJECTED_DHAN_API", { error: errMsg, response: realOrderResult });
                return;
            }
        } catch (dhanErr) {
            console.error(`❌ [DHAN API ORDER EXCEPTION]: ${dhanErr.message}`);
            this.broadcastTelemetry("REAL_ORDER_FAILED_DHAN_API", { error: dhanErr.message });
            return;
        }

        // Target Profit & Stop Loss Calculation (15 pts Risk, 1:2.2 RR TP Target)
        const riskPoints = 15.0;
        const rawSL = entryPremium - riskPoints;
        const initialSL = Number((rawSL > 0 ? rawSL : Math.max(0.50, entryPremium * 0.5)).toFixed(2));
        const targetProfit = Number((entryPremium + (riskPoints * 2.2)).toFixed(2));

        // Create Active Position State
        this.activePosition = {
            orderId: realDhanOrderId,
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
        this.marginUsed = requiredMargin;

        console.log(`===========================================================`);
        console.log(`✅ [SMART ORDER MANAGER ENTRY CONFIRMED]`);
        console.log(`   - Order ID: ${this.activePosition.orderId}`);
        console.log(`   - Symbol: ${symbol} (SecID: ${securityId})`);
        console.log(`   - Entry Premium: ₹${entryPremium}`);
        console.log(`   - Target Profit (TP): ₹${targetProfit}`);
        console.log(`   - Initial SL: ₹${initialSL} (Risk = ₹${riskPoints}/Lot)`);
        console.log(`===========================================================`);

        this.broadcastTelemetry("POSITION_OPENED", this.activePosition);
    }

    /**
     * Direct Dhan API Positions Sync: Queries GET /positions directly from Dhan servers.
     * Updates real live unrealized PnL, Buy Avg, and syncs position closure on Dhan app.
     */
    async syncDhanLivePosition() {
        if (!this.dhan || typeof this.dhan.portfolio?.getPositions !== 'function') return null;

        try {
            const posRes = await this.dhan.portfolio.getPositions();
            const posList = Array.isArray(posRes?.data) ? posRes.data : (Array.isArray(posRes) ? posRes : []);

            const getNetQty = (p) => {
                if (p.netQty !== undefined && p.netQty !== null) return Number(p.netQty);
                if (p.positionQty !== undefined && p.positionQty !== null) return Number(p.positionQty);
                return 0;
            };

            const getSecId = (p) => String(p.securityId || p.security_id || p.secId || '');
            const getSymbol = (p) => String(p.tradingSymbol || p.symbol || p.customSymbol || '');

            if (!this.activePosition || !this.isOrderActive) {
                // Active Position Recovery: Only recover if REAL netQty > 0 on Dhan broker
                const openDhanPos = posList.find(p => getNetQty(p) > 0 && (p.exchangeSegment === 'NSE_FNO' || p.segment === 'NSE_FNO'));
                if (openDhanPos) {
                    const symbol = getSymbol(openDhanPos);
                    const securityId = getSecId(openDhanPos);
                    const qty = getNetQty(openDhanPos) || 65;
                    const entryPrice = Number(openDhanPos.buyAvg || openDhanPos.costPrice || 0);
                    const optionType = symbol.endsWith('CE') || symbol.includes('CE') ? 'CE' : 'PE';
                    const riskPoints = 15.0;
                    const rawSL = entryPrice - riskPoints;
                    const initialSL = Number((rawSL > 0 ? rawSL : Math.max(0.50, entryPrice * 0.5)).toFixed(2));
                    const targetProfit = Number((entryPrice + (riskPoints * 2.2)).toFixed(2));
                    const serverUnrealizedPnl = Number(openDhanPos.unrealizedProfit || openDhanPos.unrealizedPnl || 0.0);
                    const derivedLtp = qty > 0 ? Number((entryPrice + (serverUnrealizedPnl / qty)).toFixed(2)) : entryPrice;

                    this.activePosition = {
                        orderId: `RECOVERED_${Date.now()}`,
                        symbol,
                        securityId,
                        optionType,
                        strikePrice: 0,
                        qty,
                        entrySpot: 0,
                        entryPrice,
                        currentLtp: derivedLtp,
                        initialSL,
                        currentTrailingSL: initialSL,
                        targetProfit,
                        highestPriceSeen: entryPrice,
                        riskPoints,
                        currentMilestoneIndex: -1,
                        currentRatioText: '1:0',
                        unrealizedPnl: serverUnrealizedPnl,
                        openedAt: new Date().toLocaleTimeString()
                    };
                    this.isOrderActive = true;
                    console.log(`🔄 [SMART ORDER MANAGER RECOVERY] Restored active Dhan position: ${symbol} (BuyAvg: ₹${entryPrice}, Qty: ${qty})`);
                }
                return posList;
            }

            const activeSecId = String(this.activePosition.securityId || '');
            const activeSym = String(this.activePosition.symbol || '');

            const liveMatch = posList.find(p => {
                const pSecId = getSecId(p);
                const pSym = getSymbol(p);
                if (activeSecId && pSecId && activeSecId === pSecId) return true;
                if (activeSym && pSym && (activeSym === pSym || pSym.includes(activeSym) || activeSym.includes(pSym))) return true;
                return false;
            });

            if (liveMatch) {
                const netQty = getNetQty(liveMatch);
                if (netQty === 0 && this.isOrderActive) {
                    console.log(`⚠️ [SMART ORDER MANAGER DHAN SYNC] Position ${this.activePosition.symbol} closed on Dhan App/Terminal.`);
                    const exitPrice = Number(liveMatch.sellAvg || liveMatch.costPrice || this.activePosition.currentLtp);
                    this.activePosition.currentLtp = exitPrice;
                    this.closePosition("EXTERNALLY_CLOSED_DHAN_APP");
                    return posList;
                }

                const serverUnrealizedPnl = Number(liveMatch.unrealizedProfit || liveMatch.unrealizedPnl || 0.0);
                const officialBuyAvg = Number(liveMatch.buyAvg || liveMatch.costPrice || 0);

                if (officialBuyAvg > 0) {
                    this.activePosition.entryPrice = officialBuyAvg;
                }
                this.activePosition.unrealizedPnl = serverUnrealizedPnl;
            } else if (this.isOrderActive) {
                console.warn(`⚠️ [SMART ORDER MANAGER DHAN SYNC] Position ${this.activePosition.symbol} absent on Dhan servers. Auto-clearing state.`);
                this.activePosition = null;
                this.isOrderActive = false;
                this.marginUsed = 0;
                this.broadcastTelemetry("GHOST_POSITION_CLEARED", { reason: "Position absent from Dhan broker active positions" });
            }
            return posList;
        } catch (err) {
            console.warn(`⚠️ [SMART ORDER MANAGER DHAN SYNC NOTICE] ${err.message}`);
            return null;
        }
    }

    /**
     * Handles live spot price ticks & fetches real Option LTP from Dhan API
     */
    onSpotPriceTick(spotPrice) {
        if (!this.isOrderActive || !this.activePosition || !spotPrice) return;
        const pos = this.activePosition;

        // Fetch real option strike LTP directly from Dhan API
        this.strikeFetcher.fetchLiveOptionLtp(pos.strikePrice, pos.optionType, pos.securityId)
            .then(realLtp => {
                if (realLtp && realLtp > 0 && this.isOrderActive && this.activePosition) {
                    this.onOptionPriceTick(realLtp);
                }
            })
            .catch(err => {
                this.broadcastTelemetry("DHAN_OPTION_TICK_NOTICE", { error: err.message, position: pos.symbol });
            });

        // Sync position state with Dhan server GET /positions
        this.syncDhanLivePosition()
            .catch(() => {});
    }

    /**
     * Live Option Price Tick Handler & Stepless Trailing SL Engine
     */
    onOptionPriceTick(ltp) {
        if (!this.isOrderActive || !this.activePosition || !ltp || ltp <= 0) return;

        const pos = this.activePosition;
        pos.currentLtp = Number(ltp.toFixed(2));

        // Calculate Real Unrealized PnL
        const pnlPerShare = pos.currentLtp - pos.entryPrice;
        pos.unrealizedPnl = Number((pnlPerShare * pos.qty).toFixed(2));

        // Update Peak Price Achieved
        if (pos.currentLtp > pos.highestPriceSeen) {
            pos.highestPriceSeen = pos.currentLtp;
        }

        // Check Target Profit (TP) Hit (1:2.2 RR Target)
        if (pos.targetProfit && pos.currentLtp >= pos.targetProfit) {
            console.log(`🎯 [SMART ORDER MANAGER EXIT] Target Profit (TP) HIT! Price: ₹${pos.currentLtp} >= Target: ₹${pos.targetProfit}`);
            this.closePosition("TARGET_PROFIT_HIT");
            return;
        }

        // Check Trailing SL Hit
        if (pos.currentLtp <= pos.currentTrailingSL) {
            console.log(`🚨 [SMART ORDER MANAGER EXIT] Trailing SL HIT! Price: ₹${pos.currentLtp} <= Trailing SL: ₹${pos.currentTrailingSL}`);
            this.closePosition("TRAILING_SL_HIT");
            return;
        }

        // Evaluate Trailing SL Progression
        const riskPts = pos.riskPoints && pos.riskPoints > 0 ? pos.riskPoints : 15.0;
        const gainedPoints = pos.highestPriceSeen - pos.entryPrice;
        const currentRRRatio = gainedPoints / riskPts;

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
                    console.log(`📈 [SMART ORDER MANAGER TRAIL] Milestone ${pos.currentRatioText} Reached! Peak: ₹${pos.highestPriceSeen} | Trailing SL: ₹${oldSL} ➔ ₹${newTrailingSL}`);
                }
                break;
            }
        }

        // Broadcast live telemetry to monitor UI
        this.broadcastTelemetry("LIVE_TICK_UPDATE", this.activePosition);
    }

    /**
     * Step 4: Close Active Position & Submit REAL Market SELL Order to Dhan API
     */
    async closePosition(reason = "MANUAL_EXIT") {
        if (!this.isOrderActive || !this.activePosition) return;

        const pos = this.activePosition;

        // Submit REAL Exit Market SELL Order to Dhan API
        if (this.dhan && pos.securityId && typeof this.dhan.orders?.placeOrder === 'function') {
            try {
                console.log(`🚀 [SMART ORDER MANAGER DHAN EXIT] Submitting Real Exit Order for ${pos.symbol} (SecID: ${pos.securityId})...`);
                const exitRes = await this.dhan.orders.placeOrder({
                    transactionType: 'SELL',
                    exchangeSegment: 'NSE_FNO',
                    productType: 'INTRADAY',
                    orderType: 'MARKET',
                    validity: 'DAY',
                    securityId: String(pos.securityId),
                    quantity: pos.qty,
                    price: 0
                });

                console.log(`📩 [DHAN EXIT RESPONSE]:`, JSON.stringify(exitRes, null, 2));
                if (exitRes && (exitRes.status === 'success' || exitRes.orderId || exitRes.data?.orderId)) {
                    console.log(`✅ [DHAN API REAL EXIT SUBMITTED] Order ID: ${exitRes.orderId || exitRes.data?.orderId}`);
                } else {
                    const errMsg = exitRes?.errorData?.errorMessage || exitRes?.message || 'Dhan exit order rejected';
                    console.error(`⚠️ [DHAN API REAL EXIT REJECTED]: ${errMsg}`);
                    this.broadcastTelemetry("REAL_EXIT_REJECTED_DHAN_API", { error: errMsg, response: exitRes });
                }
            } catch (exitErr) {
                console.error(`❌ [DHAN EXIT EXCEPTION]: ${exitErr.message}`);
                this.broadcastTelemetry("REAL_EXIT_FAILED_DHAN_API", { error: exitErr.message });
            }
        }

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
        console.log(`   - Net PnL: ${netPnl >= 0 ? '+' : ''}₹${netPnl}`);
        console.log(`   - Updated Balance: ₹${this.accountBalance}`);
        console.log(`===========================================================`);

        // Broadcast final exit telemetry to monitor UI
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

        const now = Date.now();
        const isCriticalEvent = event.includes('OPENED') || event.includes('CLOSED') || event.includes('FAILED') || event.includes('REJECTED');

        if (!isCriticalEvent && (now - this.lastTelemetryTime < this.telemetryThrottleMs)) {
            return; // Skip rapid updates to keep UI smooth and readable
        }
        this.lastTelemetryTime = now;

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
                    console.log('⏰ [SMART ORDER MANAGER] 3:10 PM IST Auto-Cut Triggered!');
                    this.closePosition("AUTO_CUT_310_PM");
                }
            }
        };

        this.autoCutTimer = setInterval(checkAutoCut, 60000);
    }
}

// Allow direct execution via command line
if (require.main === module) {
    async function runOrderManagerStandalone() {
        const orderManager = new SmartOrderManager();
        await orderManager.init();
    }

    runOrderManagerStandalone();
}

module.exports = SmartOrderManager;
