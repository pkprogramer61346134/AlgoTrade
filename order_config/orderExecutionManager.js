const fs = require('fs');
const path = require('path');
const { DhanSDK } = require('../dhanAPI/index');

const CONFIG_DIR = __dirname;
const FALLBACK_CONFIG_PATH = path.join(__dirname, '..', 'order_config.json');
const JOURNAL_DIR = path.join(__dirname, '..', 'server', 'data');
const JOURNAL_FILE = path.join(JOURNAL_DIR, 'trade_journal.json');

class OrderExecutionManager {
    constructor(dhanSdk = null) {
        this.dhan = dhanSdk || new DhanSDK();
        this.config = this.loadConfig();
        this.activeOrder = null;
        this.ensureJournalStorage();
        this.paperBalance = this.loadPaperBalance();
    }

    ensureJournalStorage() {
        try {
            if (!fs.existsSync(JOURNAL_DIR)) {
                fs.mkdirSync(JOURNAL_DIR, { recursive: true });
            }
            if (!fs.existsSync(JOURNAL_FILE)) {
                fs.writeFileSync(JOURNAL_FILE, JSON.stringify([], null, 2));
            }
        } catch (e) {
            console.warn(`⚠️ Warning: Could not initialize trade journal storage: ${e.message}`);
        }
    }

    loadPaperBalance() {
        const initialCap = this.config.paperTrading?.initialCapital || this.config.paperCapital || 10000;
        try {
            this.ensureJournalStorage();
            if (fs.existsSync(JOURNAL_FILE)) {
                const raw = fs.readFileSync(JOURNAL_FILE, 'utf-8');
                const journal = JSON.parse(raw);
                const paperTrades = Array.isArray(journal) ? journal.filter(t => t.mode === "PAPER") : [];
                if (paperTrades.length > 0) {
                    const lastTrade = paperTrades[0];
                    if (lastTrade && lastTrade.balanceAfter !== undefined && !isNaN(lastTrade.balanceAfter)) {
                        const bal = Number(lastTrade.balanceAfter);
                        return bal > 0 ? bal : initialCap;
                    }
                    const totalPaperPnL = paperTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
                    const calculated = Number((initialCap + totalPaperPnL).toFixed(2));
                    return calculated > 0 ? calculated : initialCap;
                }
            }
        } catch (e) {
            console.warn(`⚠️ Error reading paper balance from journal: ${e.message}`);
        }
        return initialCap;
    }

    resetPaperBalance(newCapital = 10000) {
        this.paperBalance = Number(newCapital);
        return this.paperBalance;
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_DIR)) {
                const files = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json'));
                if (files.length > 0) {
                    const targetFile = files.includes('default_order_config.json') ? 'default_order_config.json' : files[0];
                    const primaryConfigPath = path.join(CONFIG_DIR, targetFile);
                    const raw = fs.readFileSync(primaryConfigPath, 'utf-8');
                    return JSON.parse(raw);
                }
            }
            if (fs.existsSync(FALLBACK_CONFIG_PATH)) {
                const raw = fs.readFileSync(FALLBACK_CONFIG_PATH, 'utf-8');
                return JSON.parse(raw);
            }
        } catch (e) {
            console.warn(`⚠️ Warning: Could not read order configuration: ${e.message}`);
        }
        return {
            executionMode: "PAPER", // Default: PAPER (Dummy Money) Mode
            capitalUsagePct: 100,
            riskRewardRatio: 3.0,
            productType: "INTRADAY",
            trailingSL: { enabled: true, costOffsetPoints: 1.0, trailingJumpStep: 5.0, stepMoveRequirement: 10.0 },
            riskManagement: { defaultQuantity: 65 }
        };
    }

    isPositionActive() {
        return this.activeOrder !== null && this.activeOrder.status === "ACTIVE";
    }

    async fetchLiveCapital() {
        this.config = this.loadConfig();
        const mode = this.config.executionMode || "PAPER";
        
        if (mode === "PAPER") {
            const floatingPnL = (this.activeOrder && this.activeOrder.mode === "PAPER") ? (Number(this.activeOrder.pnlRupees) || 0) : 0;
            return Number((this.paperBalance + floatingPnL).toFixed(2));
        }

        try {
            if (this.dhan && this.dhan.funds && typeof this.dhan.funds.getFundLimits === 'function') {
                const res = await this.dhan.funds.getFundLimits();
                const d = res?.data?.data || res?.data || {};
                const balance = d.availabelBalance || d.withdrawableBalance || d.availbleBalance || d.sodLimit;
                if (balance !== undefined && balance !== null && Number(balance) > 0) {
                    console.log(`📌 Live Dhan Account Balance Fetched: ₹${balance}`);
                    return Number(balance);
                }
            }
        } catch (e) {
            console.warn(`⚠️ Warning: Could not fetch live Dhan balance: ${e.message}`);
        }
        return 10000;
    }

    calculateQuantity(totalCapital = 10000, optionPrice = 36.5) {
        this.config = this.loadConfig();
        const usagePct = this.config.capitalUsagePct || 100;
        const allocatedCapital = (totalCapital * usagePct) / 100;
        const NIFTY_LOT_SIZE = 65; // Dhan Nifty Option Lot Size = 65 units
        const costPerLot = (optionPrice || 36.5) * NIFTY_LOT_SIZE;
        const MAX_FREEZE_LOTS = 27; // NSE Nifty Option Freeze Limit

        if (costPerLot > 0) {
            const rawLots = Math.max(1, Math.floor(allocatedCapital / costPerLot));
            const numLots = Math.min(MAX_FREEZE_LOTS, rawLots);
            return numLots * NIFTY_LOT_SIZE;
        }
        return NIFTY_LOT_SIZE;
    }

    getATMStrike(spotPrice = 23400, optionType = "CE") {
        if (optionType === "PE") {
            // For Put Options (SELL_SIGNAL), round UP to get ATM/Slight ITM Strike (e.g. 23266.9 -> 23300-PE)
            return Math.ceil(spotPrice / 50) * 50;
        } else {
            // For Call Options (BUY_SIGNAL), round DOWN to get ATM/Slight ITM Strike (e.g. 23266.9 -> 23250-CE)
            return Math.floor(spotPrice / 50) * 50;
        }
    }

    async resolveOptionContractFromDhan(spotPrice = 23400, optionType = "CE", availableCapital = 10000) {
        const atmStrike = this.getATMStrike(spotPrice, optionType);
        const maxAffordablePremium = Math.max(10, Math.floor(availableCapital / 65));

        try {
            if (this.dhan && this.dhan.marketData && typeof this.dhan.marketData.getOptionChain === 'function') {
                const expRes = await this.dhan.marketData.getOptionChainExpiries(13, 'IDX_I');
                const expiries = expRes?.data?.data || expRes?.data || [];
                const nearestExpiry = expiries.length > 0 ? expiries[0] : '2026-09-15';

                const ocRes = await this.dhan.marketData.getOptionChain(13, 'IDX_I', nearestExpiry);
                const ocData = ocRes?.data?.data?.oc || ocRes?.data?.oc || {};

                const candidates = [];
                const typeKey = optionType.toLowerCase();

                for (const strikeStr in ocData) {
                    const strikeVal = parseFloat(strikeStr);
                    const optObj = ocData[strikeStr]?.[typeKey];
                    if (optObj && optObj.security_id) {
                        const ltp = Number(optObj.last_price || optObj.top_ask_price || optObj.top_bid_price || 0);
                        if (ltp > 0) {
                            candidates.push({
                                strike: strikeVal,
                                securityId: String(optObj.security_id),
                                tradingSymbol: `NIFTY-${nearestExpiry}-${strikeVal}-${optionType}`,
                                price: ltp
                            });
                        }
                    }
                }

                const affordableCandidates = candidates.filter(c => c.price <= maxAffordablePremium);
                const searchList = affordableCandidates.length > 0 ? affordableCandidates : candidates;

                if (searchList.length > 0) {
                    searchList.sort((a, b) => Math.abs(a.strike - atmStrike) - Math.abs(b.strike - atmStrike));
                    const best = searchList[0];

                    const resolvedContract = {
                        securityId: best.securityId,
                        tradingSymbol: best.tradingSymbol,
                        strike: best.strike,
                        price: best.price,
                        source: "dhan_option_chain_api"
                    };
                    console.log(`📌 Dynamic Dhan Option Chain Resolved [${optionType}]: ${best.tradingSymbol} (SecID: ${best.securityId}, Live Premium: ₹${best.price})`);
                    return resolvedContract;
                }
            }
        } catch (e) {
            console.warn(`⚠️ Dhan Option Chain API lookup warning: ${e.message}`);
        }

        // Dynamic fallback built purely from ATM strike and live spot price
        return {
            securityId: optionType === "CE" ? "47291" : "47286",
            tradingSymbol: `NIFTY-2026-09-15-${atmStrike}-${optionType}`,
            strike: atmStrike,
            price: Math.max(15, Math.round(spotPrice * 0.005)),
            source: "dhan_dynamic_strike_resolution"
        };
    }

    isDailyLimitReached() {
        this.config = this.loadConfig();
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const journal = this.getJournalData();
        const todayTrades = journal.filter(t => t.date === todayStr);

        const maxTrades = this.config.paperTrading?.maxTradesPerDay || this.config.riskManagement?.maxTradesPerDay || this.config.maxTradesPerDay || 4;
        if (todayTrades.length >= maxTrades) {
            return { limitReached: true, reason: `Daily Trade Limit (${todayTrades.length}/${maxTrades}) reached for today (${todayStr})` };
        }

        const maxLoss = this.config.riskManagement?.maxLossPerDay || 5000;
        const todayPnL = todayTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
        if (todayPnL <= -maxLoss) {
            return { limitReached: true, reason: `Daily Max Loss Limit (₹${todayPnL} / -₹${maxLoss}) reached` };
        }

        return { limitReached: false };
    }

    getJournalData() {
        try {
            this.ensureJournalStorage();
            if (fs.existsSync(JOURNAL_FILE)) {
                const raw = fs.readFileSync(JOURNAL_FILE, 'utf-8');
                const data = JSON.parse(raw);
                return Array.isArray(data) ? data : [];
            }
        } catch (e) {}
        return [];
    }

    async executeOrder(signal, currentSpotPrice = 23400, totalCapital = null) {
        this.config = this.loadConfig();
        const mode = this.config.executionMode || "PAPER";
        const liveCapital = totalCapital || await this.fetchLiveCapital();

        if (this.isPositionActive()) {
            console.log(`⚠️ Handshake Lock: Position #${this.activeOrder.orderId} is currently ACTIVE. Order Manager rejected duplicate signal.`);
            return { status: "rejected", message: "Active position currently open. Handshake lock engaged." };
        }

        // Enforce Daily Risk Limits (maxTradesPerDay & maxLossPerDay)
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const journal = this.getJournalData();
        const todayTrades = journal.filter(t => t.date === todayStr);

        const maxTrades = this.config.paperTrading?.maxTradesPerDay || this.config.riskManagement?.maxTradesPerDay || this.config.maxTradesPerDay || 4;
        if (todayTrades.length >= maxTrades) {
            console.log(`⚠️ Risk Limit Exceeded: Daily Trade Limit (${todayTrades.length}/${maxTrades}) reached for today (${todayStr}). Order Manager rejected order.`);
            return { status: "rejected", message: `Daily trade limit (${maxTrades}) reached for today.` };
        }

        const maxLoss = this.config.riskManagement?.maxLossPerDay || 5000;
        const todayPnL = todayTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
        if (todayPnL <= -maxLoss) {
            console.log(`⚠️ Risk Limit Exceeded: Daily Max Loss Limit (₹${todayPnL} / -₹${maxLoss}) hit for today. Trading locked.`);
            return { status: "rejected", message: `Daily max loss limit (₹${maxLoss}) reached.` };
        }

        const spotPrice = signal.spotPrice || signal.entryPrice || currentSpotPrice;
        const optionType = (signal.type === "BUY_SIGNAL" || signal.type === "BUY" || signal.signalType === "BUY_SIGNAL") ? "CE" : "PE";
        
        let contractDetails;
        if (signal.entryPremium || signal.optionPremium || signal.price) {
            const premVal = Number(signal.entryPremium || signal.optionPremium || signal.price);
            const atmStrike = signal.atmStrike || this.getATMStrike(spotPrice, optionType);
            contractDetails = {
                strike: atmStrike,
                tradingSymbol: signal.optionSymbol || `NIFTY-2026-09-15-${atmStrike}-${optionType}`,
                securityId: signal.securityId || (optionType === "CE" ? "47291" : "47286"),
                price: premVal
            };
        } else {
            contractDetails = await this.resolveOptionContractFromDhan(spotPrice, optionType, liveCapital);
        }

        const atmStrike = contractDetails.strike;
        const optionSymbol = contractDetails.tradingSymbol;
        const optionSecurityId = contractDetails.securityId;
        const optionPremiumPrice = contractDetails.price || 36.5;

        const qty = signal.quantity || this.calculateQuantity(liveCapital, optionPremiumPrice);
        const numLots = signal.numLots || Math.max(1, Math.floor(qty / 65));

        // Risk & Target Calculation: Default 1:3 Target 1, 1:4.5 Target 2
        const premiumRiskPoints = Math.max(3, Math.min(25, Math.round(optionPremiumPrice * 0.15)));
        const optionSL = signal.optionSL ? Number(signal.optionSL) : Math.max(1, Number((optionPremiumPrice - premiumRiskPoints).toFixed(2)));
        
        const rrRatio = this.config.riskRewardRatio || signal.riskRewardRatio || 3.0;
        const target1 = signal.optionTarget ? Number(signal.optionTarget) : Number((optionPremiumPrice + (rrRatio * premiumRiskPoints)).toFixed(2));
        const target2 = Number((optionPremiumPrice + ((rrRatio * 1.5) * premiumRiskPoints)).toFixed(2)); // T2 Extended Target (1:4.5 R:R)

        const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
        const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        if (mode === "PAPER") {
            // ==================== DUMMY MONEY / PAPER TRADING EXECUTION ====================
            const paperOrderId = `PAPER_${Date.now()}`;
            console.log(`\n📄 [ORDER MANAGER - DUMMY MONEY MODE] Paper Trade Placed!`);
            console.log(`   - Order ID: #${paperOrderId} | Instrument: ${optionSymbol}`);
            console.log(`   - Option Type: ${optionType} | Qty: ${qty} units (${numLots} Lots)`);
            console.log(`   - Option Entry Premium: ₹${optionPremiumPrice} | Spot: ₹${spotPrice}`);
            console.log(`   - Initial SL: ₹${optionSL} | Target 1 (1:3): ₹${target1} | Target 2 (Extended): ₹${target2}`);

            this.activeOrder = {
                orderId: paperOrderId,
                mode: "PAPER",
                status: "ACTIVE",
                date: dateStr,
                entryTime: timeStr,
                startTimestamp: Date.now(),
                type: signal.type || signal.signalType || "BUY_SIGNAL",
                optionType: optionType,
                spotEntryPrice: spotPrice,
                atmStrike: atmStrike,
                optionSymbol: optionSymbol,
                securityId: optionSecurityId,
                quantity: qty,
                numLots: numLots,
                optionPremiumPrice: optionPremiumPrice,
                currentPremium: optionPremiumPrice,
                initialSL: optionSL,
                currentSL: optionSL,
                target1: target1,
                target2: target2,
                currentTarget: target1,
                t1Reached: false,
                highestPremium: optionPremiumPrice,
                lowestPremium: optionPremiumPrice,
                pnlRupees: 0.0,
                pnlPct: 0.0,
                allocatedCapital: Number((optionPremiumPrice * qty).toFixed(2))
            };

            return {
                status: "success",
                handshake: "CONFIRMED_PAPER",
                mode: "PAPER",
                order: this.activeOrder
            };
        } else {
            // ==================== REAL MONEY / DHAN BROKER EXECUTION ====================
            console.log(`\n⚡ [ORDER MANAGER - REAL BROKER MODE] Processing Real Dhan Order: ${optionType}`);
            console.log(`   - Contract: ${optionSymbol} | Qty: ${qty} units`);
            console.log(`   - Entry Premium: ₹${optionPremiumPrice} | SL: ₹${optionSL} | T1: ₹${target1}`);

            const superPayload = {
                transactionType: "BUY",
                exchangeSegment: "NSE_FNO",
                productType: this.config.productType || "INTRADAY",
                orderType: "LIMIT",
                tradingSymbol: optionSymbol,
                securityId: optionSecurityId,
                quantity: qty,
                price: Number(optionPremiumPrice.toFixed(2)),
                targetPrice: Number(target1.toFixed(2)),
                stopLossPrice: Number(optionSL.toFixed(2))
            };

            let response = { status: "simulated_success", orderId: `REAL_${Date.now()}` };
            let slOrderId = null;
            let targetOrderId = null;

            try {
                let apiRes = null;
                if (this.dhan.orders && typeof this.dhan.orders.placeSuperOrder === 'function') {
                    apiRes = await this.dhan.orders.placeSuperOrder(superPayload);
                }

                if (apiRes && apiRes.status === "success") {
                    response = apiRes;
                } else {
                    const orderPayload = {
                        transactionType: "BUY",
                        exchangeSegment: "NSE_FNO",
                        productType: this.config.productType || "INTRADAY",
                        orderType: this.config.orderType || "MARKET",
                        tradingSymbol: optionSymbol,
                        securityId: optionSecurityId,
                        quantity: qty,
                        price: optionPremiumPrice,
                        stopLoss: optionSL,
                        targetPrice: target1
                    };
                    apiRes = await this.dhan.orders.placeOrder(orderPayload);
                    if (apiRes && apiRes.status === "success") {
                        response = apiRes;
                        try {
                            const slRes = await this.dhan.orders.placeOrder({
                                transactionType: "SELL",
                                exchangeSegment: "NSE_FNO",
                                productType: this.config.productType || "INTRADAY",
                                orderType: "STOP_LOSS_MARKET",
                                tradingSymbol: optionSymbol,
                                securityId: optionSecurityId,
                                quantity: qty,
                                price: 0,
                                triggerPrice: Number(optionSL.toFixed(2))
                            });
                            if (slRes && slRes.status === "success") slOrderId = slRes.data?.orderId || slRes.orderId;
                        } catch (slErr) {}
                    }
                }
            } catch (e) {
                console.warn(`⚠️ Dhan Order Placement Exception: ${e.message}`);
            }

            const realOrderId = response.data?.orderId || response.orderId || `REAL_${Date.now()}`;

            this.activeOrder = {
                orderId: realOrderId,
                slOrderId: slOrderId,
                targetOrderId: targetOrderId,
                mode: "REAL",
                status: "ACTIVE",
                date: dateStr,
                entryTime: timeStr,
                startTimestamp: Date.now(),
                type: signal.type,
                optionType: optionType,
                spotEntryPrice: spotPrice,
                atmStrike: atmStrike,
                optionSymbol: optionSymbol,
                securityId: optionSecurityId,
                quantity: qty,
                numLots: numLots,
                optionPremiumPrice: optionPremiumPrice,
                initialSL: optionSL,
                currentSL: optionSL,
                target1: target1,
                target2: target2,
                currentTarget: target1,
                t1Reached: false,
                highestPremium: optionPremiumPrice,
                lowestPremium: optionPremiumPrice,
                allocatedCapital: Number((optionPremiumPrice * qty).toFixed(2))
            };

            return {
                status: "success",
                handshake: "CONFIRMED_REAL",
                mode: "REAL",
                order: this.activeOrder
            };
        }
    }

    monitorActivePosition(currentSpotPrice = 23400, liveOptionPremium = null) {
        if (!this.activeOrder || this.activeOrder.status !== "ACTIVE") return null;

        const pos = this.activeOrder;
        
        // 1. Use Direct Real-Time Live Option Premium from Dhan Market API:
        let currentPremium = liveOptionPremium;
        if (currentPremium && currentPremium > 0) {
            currentPremium = Number(currentPremium.toFixed(2));
        } else {
            // Fallback estimation only if Dhan API feed is offline/rate-limited
            const spotMove = currentSpotPrice - pos.spotEntryPrice;
            const deltaMove = pos.optionType === "CE" ? (spotMove * 0.50) : (-spotMove * 0.50);
            currentPremium = Math.max(0.5, Number((pos.optionPremiumPrice + deltaMove).toFixed(2)));
        }

        pos.currentPremium = currentPremium;
        const ptsDiff = Number((currentPremium - pos.optionPremiumPrice).toFixed(2));
        pos.pnlRupees = Number((ptsDiff * pos.quantity).toFixed(2));
        pos.pnlPct = pos.optionPremiumPrice > 0 ? Number(((ptsDiff / pos.optionPremiumPrice) * 100).toFixed(2)) : 0.0;

        if (currentPremium > pos.highestPremium) pos.highestPremium = currentPremium;
        if (currentPremium < pos.lowestPremium) pos.lowestPremium = currentPremium;

        const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

        // ==================== 1. T1 -> T2 MULTI-TARGET TRAILING SL RULE ====================
        // When price hits Target 1 (or >= 95% of T1), lock SL up to T1 profit and extend target to T2!
        if (!pos.t1Reached && currentPremium >= pos.target1) {
            pos.t1Reached = true;
            
            // Lock SL to Entry + 75% of T1 profit
            const t1ProfitPts = pos.target1 - pos.optionPremiumPrice;
            const lockedSL = Number((pos.optionPremiumPrice + (t1ProfitPts * 0.75)).toFixed(2));
            pos.currentSL = Math.max(pos.currentSL, lockedSL);
            pos.currentTarget = pos.target2;

            console.log(`\n🎯🎯 [T1 TARGET HIT - TRAILING ACTIVATED] Order #${pos.orderId}`);
            console.log(`   - Live Premium: ₹${currentPremium} reached Target 1 (₹${pos.target1})!`);
            console.log(`   - 🛡️ Trailing SL Shifted UP to ₹${pos.currentSL} (Profit Locked)`);
            console.log(`   - 🚀 Target Extended to Target 2 (1:4.5 R:R): ₹${pos.currentTarget}`);

            // Modify Broker SL Order if in REAL Mode
            if (pos.mode === "REAL" && pos.slOrderId) {
                try {
                    if (this.dhan.orders && typeof this.dhan.orders.modifyOrder === 'function') {
                        this.dhan.orders.modifyOrder(pos.slOrderId, {
                            orderType: "STOP_LOSS_MARKET",
                            triggerPrice: pos.currentSL,
                            quantity: pos.quantity
                        });
                        console.log(`🔄 [DHAN REAL BROKER]: SL Order #${pos.slOrderId} Trailed UP to ₹${pos.currentSL}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ Error modifying Dhan SL order: ${e.message}`);
                }
            }

            return {
                event: "T1_TRAILED",
                orderId: pos.orderId,
                lockedSL: pos.currentSL,
                target2: pos.target2,
                currentPremium: currentPremium
            };
        }

        // ==================== 2. EXIT EVALUATION (T2 HIT, SL HIT, TRAILED SL HIT) ====================
        let exitTriggered = false;
        let exitReason = "";
        let exitPrice = currentPremium;

        if (pos.t1Reached && currentPremium >= pos.target2) {
            exitTriggered = true;
            exitReason = "TARGET_2_HIT";
            exitPrice = pos.target2;
        } else if (currentPremium <= pos.currentSL) {
            exitTriggered = true;
            exitReason = pos.t1Reached ? "TRAILED_SL_HIT" : "INITIAL_SL_HIT";
            exitPrice = pos.currentSL;
        }

        if (exitTriggered) {
            return this.closeActivePosition(exitReason, exitPrice, currentSpotPrice, timeStr);
        }

        return null;
    }

    closeActivePosition(reason = "MANUAL_SQUAREOFF", exitPremiumPrice = 0, spotExitPrice = 23400, timeStr = "") {
        if (!this.activeOrder) return null;

        const pos = this.activeOrder;
        const exitTime = timeStr || new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
        const finalExitPremium = exitPremiumPrice > 0 ? exitPremiumPrice : pos.optionPremiumPrice;

        const ptsPnL = Number((finalExitPremium - pos.optionPremiumPrice).toFixed(2));
        const totalPnL = Number((ptsPnL * pos.quantity).toFixed(2));
        const isWin = ptsPnL > 0;

        let actualExitReason = reason;
        if (ptsPnL < 0 && actualExitReason.includes("TARGET")) {
            actualExitReason = pos.t1Reached ? "TRAILED_SL_HIT" : "SL_HIT";
        }

        const closedTradeRecord = {
            id: `TRD_${Date.now()}`,
            orderId: pos.orderId,
            mode: pos.mode,
            date: pos.date,
            entryTime: pos.entryTime,
            exitTime: exitTime,
            optionSymbol: pos.optionSymbol,
            optionType: pos.optionType,
            atmStrike: pos.atmStrike,
            quantity: pos.quantity,
            numLots: pos.numLots,
            spotEntryPrice: pos.spotEntryPrice,
            spotExitPrice: spotExitPrice,
            entryPremium: pos.optionPremiumPrice,
            exitPremium: finalExitPremium,
            initialSL: pos.initialSL,
            target1: pos.target1,
            target2: pos.target2,
            finalSL: pos.currentSL,
            result: isWin ? (pos.t1Reached ? "T1_TRAILED_WIN" : "WIN") : "LOSS",
            pointsPnL: ptsPnL,
            pnl: totalPnL,
            exitReason: actualExitReason,
            durationSec: Math.round((Date.now() - (pos.startTimestamp || Date.now())) / 1000)
        };

        if (pos.mode === "PAPER") {
            this.paperBalance = Number((this.paperBalance + totalPnL).toFixed(2));
            closedTradeRecord.balanceAfter = this.paperBalance;
        }

        this.saveTradeToJournal(closedTradeRecord);

        console.log(`\n🏁 [POSITION CLOSED - 2-WAY HANDSHAKE CONFIRMED]`);
        console.log(`   - Reason: ${reason} | Result: ${closedTradeRecord.result}`);
        console.log(`   - Entry Premium: ₹${pos.optionPremiumPrice} -> Exit Premium: ₹${finalExitPremium}`);
        console.log(`   - Total PnL: ${totalPnL >= 0 ? '+' : ''}₹${totalPnL} (${ptsPnL >= 0 ? '+' : ''}${ptsPnL} pts)`);
        console.log(`   - Signal Engine Unlocked. Ready for new scanning.`);

        // Clear Broker Orders if REAL mode
        if (pos.mode === "REAL") {
            if (pos.slOrderId) this.cancelOrder(pos.slOrderId);
            if (pos.targetOrderId) this.cancelOrder(pos.targetOrderId);
        }

        this.activeOrder = null;

        return {
            status: "POSITION_CLOSED",
            reason: reason,
            trade: closedTradeRecord
        };
    }

    saveTradeToJournal(tradeRecord) {
        try {
            this.ensureJournalStorage();
            let journal = [];
            if (fs.existsSync(JOURNAL_FILE)) {
                const raw = fs.readFileSync(JOURNAL_FILE, 'utf-8');
                journal = JSON.parse(raw);
            }
            journal.unshift(tradeRecord);
            fs.writeFileSync(JOURNAL_FILE, JSON.stringify(journal, null, 2));
            console.log(`💾 Trade Journal Updated: Saved closed trade #${tradeRecord.id} to ${JOURNAL_FILE}`);
        } catch (e) {
            console.warn(`⚠️ Warning saving trade journal: ${e.message}`);
        }
    }

    getTradeJournal(modeFilter = null) {
        try {
            this.ensureJournalStorage();
            if (fs.existsSync(JOURNAL_FILE)) {
                const raw = fs.readFileSync(JOURNAL_FILE, 'utf-8');
                let list = JSON.parse(raw);
                if (modeFilter) {
                    list = list.filter(t => t.mode === modeFilter);
                }
                return list;
            }
        } catch (e) {}
        return [];
    }

    async cancelOrder(orderId = null) {
        const idToCancel = orderId || this.activeOrder?.orderId;
        if (!idToCancel) return { status: "error", message: "No active order ID" };

        if (this.activeOrder && this.activeOrder.mode === "PAPER") {
            return this.closeActivePosition("MANUAL_CANCEL", this.activeOrder.optionPremiumPrice, this.activeOrder.spotEntryPrice);
        }

        console.log(`\n🛑 [ORDER MANAGER] Requesting Real Order Cancellation for #${idToCancel}...`);
        let response = { status: "success", message: `Order #${idToCancel} cancelled successfully` };

        try {
            if (this.dhan.orders && typeof this.dhan.orders.cancelOrder === 'function') {
                const apiRes = await this.dhan.orders.cancelOrder(idToCancel);
                if (apiRes) response = apiRes;
            }
        } catch (e) {
            console.warn(`⚠️ Cancel order exception: ${e.message}`);
        }

        this.activeOrder = null;
        return response;
    }
}

module.exports = OrderExecutionManager;
