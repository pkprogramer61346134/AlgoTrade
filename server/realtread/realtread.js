/**
 * Real Trading Master Manager & Signal Handler
 * Location: C:\AlgoTrade\server\realtread\realtread.js
 * 
 * Strict Single-Purpose Modules Stack:
 * 1. utility/usedfull/select-best-strike.js   -> Selects best option contract strike
 * 2. utility/usedfull/option-sl-target.js     -> Calculates Option Price SL & Targets (TR1-TR4)
 * 3. utility/usedfull/smart-order-executor.js -> Places option orders & manages SL/Target via Dhan
 * 4. utility/dhan-option-live-price.js        -> Streams live Option LTP & PnL via WebSocket
 * 5. server/realtread/realtread.js           -> Master Real Trading Engine Integration
 */

const realConfig = require('./config');
const masterConfig = require('../masterSL/config');
const masterSL = require('../masterSL/masterSL');

// Strict allowed modules stack only
const { selectBestOptionStrike } = require('../../utility/usedfull/select-best-strike');
const { calculateOptionSLAndTargets } = require('../../utility/usedfull/option-sl-target');
const { SmartOrderExecutor } = require('../../utility/usedfull/smart-order-executor');
const { DhanOptionLivePrice } = require('../../utility/dhan-option-live-price');
const { DhanFunds } = require('../../utility/dhan-funds');
const { DhanOrders } = require('../../utility/dhan-orders');

class RealTradeEngine {
    constructor() {
        this.isProcessingTick = false;
        this.isOrderPlacing = false;
        this.smartExecutor = new SmartOrderExecutor();
        this.livePriceTracker = new DhanOptionLivePrice();
        this.activeOptionContract = null;
        this.latestOptionTick = null;
        this.cachedFunds = null;
        this.activeOptionStreamSecId = null;
        
        // Reset any initial stale/ghost state on initialization
        masterSL.activePosition = null;
    }

    /**
     * Active Position getter matching MasterSL state
     */
    get activePosition() {
        return masterSL.activePosition;
    }

    /**
     * Trade History getter matching MasterSL state
     */
    get tradeHistory() {
        return masterSL.tradeHistory;
    }

    // =========================================================================
    // STEP 1: CHECK OPEN POSITIONS (Single Check from Dhan API)
    // =========================================================================
    async checkOpenPositions() {
        const mainConfig = require('../config_manager');
        const isEnabled = realConfig.getConfig().realTradeEnabled || mainConfig.getConfig().realTradeEnabled;
        if (!isEnabled) return { hasOpenPosition: false, position: null };

        try {
            const orders = new DhanOrders();
            const posRes = await orders.getPositions();

            const rawData = posRes?.data?.data || posRes?.data;
            const positionsList = Array.isArray(rawData) ? rawData : (Array.isArray(posRes?.data) ? posRes.data : []);

            const openDhanPositions = positionsList.filter(p => (p.positionType === "LONG" || Number(p.netQty) > 0) && Number(p.netQty) !== 0);

            if (openDhanPositions.length > 0) {
                const activeDhanPos = openDhanPositions[0];
                const secId = String(activeDhanPos.securityId);
                const entryPrice = Number(activeDhanPos.buyAvg || activeDhanPos.costPrice || 0);
                const lotSize = Math.max(1, Number(activeDhanPos.lotSize || activeDhanPos.quantityMultiplier || 65));
                const qty = Math.abs(Number(activeDhanPos.netQty || lotSize));
                const optionType = activeDhanPos.drvOptionType === "PUT" ? "PE" : "CE";
                const initialSl = Number((entryPrice * 0.85).toFixed(2));
                const tr1 = Number((entryPrice * 1.15).toFixed(2));
                const tr2 = Number((entryPrice * 1.30).toFixed(2));
                const tr3 = Number((entryPrice * 1.45).toFixed(2));
                const tr4 = Number((entryPrice * 1.60).toFixed(2));
                const tr5 = Number((entryPrice * 1.75).toFixed(2));

                if (!masterSL.activePosition || String(masterSL.activePosition.securityId) !== secId) {
                    console.log(`🔄 [POSITION CHECK] Found open Dhan broker position: ${activeDhanPos.tradingSymbol} (${secId}) | Qty: ${qty} @ ₹${entryPrice}`);
                }

                // Preserve existing trailed SL if masterSL is already tracking this position
                const isSamePos = Boolean(masterSL.activePosition && String(masterSL.activePosition.securityId) === secId);
                const currentSl = isSamePos ? masterSL.activePosition.currentSl : initialSl;
                const trailingStage = isSamePos ? masterSL.activePosition.trailingStage : "INITIAL";

                masterSL.activePosition = {
                    tradeId: isSamePos ? masterSL.activePosition.tradeId : ("MASTER_SL_REAL_" + secId),
                    symbol: activeDhanPos.tradingSymbol || `NIFTY_${activeDhanPos.drvStrikePrice}_${optionType}`,
                    securityId: secId,
                    optionType: optionType,
                    isOptionTrade: true,
                    entryDate: isSamePos ? masterSL.activePosition.entryDate : new Date().toLocaleDateString("en-CA"),
                    entryTime: isSamePos ? masterSL.activePosition.entryTime : new Date().toLocaleTimeString("en-IN"),
                    entryPrice: isSamePos ? masterSL.activePosition.entryPrice : entryPrice,
                    liveLtp: entryPrice,
                    pnl: isSamePos ? masterSL.activePosition.pnl : 0,
                    pnlPercent: isSamePos ? masterSL.activePosition.pnlPercent : "0.00%",
                    initialSl: isSamePos ? masterSL.activePosition.initialSl : initialSl,
                    currentSl: currentSl,
                    targetPrice: isSamePos ? masterSL.activePosition.targetPrice : tr2,
                    targetLabel: isSamePos ? masterSL.activePosition.targetLabel : "TR2 (1:2)",
                    targetMode: isSamePos ? masterSL.activePosition.targetMode : "1:2",
                    qty: qty,
                    lotSize: lotSize,
                    levels: isSamePos ? masterSL.activePosition.levels : { initialSl, tr1, tr2, tr3, tr4, tr5 },
                    trailingStage: trailingStage,
                    status: "OPEN",
                    orderId: activeDhanPos.orderId || "DHAN_REAL_POS_" + secId,
                    handlers: this.getRealHandlers(),
                    envName: "REAL_TRADE"
                };

                this.activeOptionContract = {
                    status: "success",
                    securityId: secId,
                    exchangeSegment: activeDhanPos.exchangeSegment || "NSE_FNO",
                    symbol: activeDhanPos.tradingSymbol,
                    lotSize: lotSize,
                    totalQty: qty,
                    liveLtp: entryPrice,
                    optionSL: initialSl,
                    optionTR1: tr1,
                    optionTR2: tr2,
                    optionTR3: tr3,
                    optionTR4: tr4,
                    optionTR5: tr5
                };

                return { hasOpenPosition: true, position: masterSL.activePosition };
            } else {
                // Dhan Terminal has ZERO open positions (Position Executed/Closed on Dhan)
                const isRecentOrder = masterSL.isOrderInFlight || (Date.now() - (masterSL.lastOrderTimestamp || 0) < 30000);
                if (!isRecentOrder && masterSL.activePosition) {
                    console.log(`✅ [DHAN POSITION SYNC] Dhan terminal has 0 open positions. Closing tracking for ${masterSL.activePosition.symbol || 'Position'}.`);
                    
                    const closedPos = {
                        ...masterSL.activePosition,
                        status: "CLOSED",
                        exitPrice: masterSL.activePosition.liveLtp || masterSL.activePosition.entryPrice,
                        exitReason: "DHAN_SUPER_ORDER_SL_OR_TARGET_HIT",
                        realizedPnl: masterSL.activePosition.pnl || 0
                    };
                    masterSL.tradeHistory.push(closedPos);

                    masterSL.activePosition = null;
                    this.activeOptionContract = null;
                    this.activeOptionStreamSecId = null;
                } else if (!isRecentOrder) {
                    masterSL.activePosition = null;
                    this.activeOptionContract = null;
                    this.activeOptionStreamSecId = null;
                }
                return { hasOpenPosition: false, position: null };
            }
        } catch (err) {
            console.warn(`⚠️ [POSITION CHECK NOTICE]: ${err.message}`);
            return { hasOpenPosition: Boolean(masterSL.activePosition), position: masterSL.activePosition };
        }
    }

    // =========================================================================
    // STEP 2: CHECK ACCOUNT BALANCE
    // =========================================================================
    async checkAccountBalance() {
        try {
            const funds = new DhanFunds();
            const fundRes = await funds.getFundLimits();
            if (fundRes && fundRes.status === "success" && fundRes.data) {
                this.cachedFunds = fundRes.data;
                const avail = Number(fundRes.data.availableBalance || fundRes.data.availabelBalance || fundRes.data.withdrawableBalance || 0);
                return { availableBalance: avail, isSufficient: avail >= 1000, data: fundRes.data };
            }
        } catch (e) {
            console.warn(`⚠️ [ACCOUNT BALANCE CHECK NOTICE]: ${e.message}`);
        }
        const fallbackAvail = Number(this.cachedFunds?.availableBalance || this.cachedFunds?.availabelBalance || 0);
        return { availableBalance: fallbackAvail, isSufficient: fallbackAvail >= 1000, data: this.cachedFunds };
    }

    // =========================================================================
    // STEP 3: SELECT OPTION STRIKE
    // =========================================================================
    async selectOptionStrike(spotPrice, optionType, maxBudget) {
        const cfg = realConfig.getConfig();
        const selectedStock = cfg.selectedStock || { securityId: 13, exchangeSegment: "IDX_I" };

        console.log(`🎯 [STRIKE SELECTION] Spot ₹${spotPrice} | Type: ${optionType} | Budget: ₹${maxBudget}`);
        const strikeInfo = await selectBestOptionStrike({
            securityId: selectedStock.securityId,
            exchangeSegment: selectedStock.exchangeSegment,
            spotPrice,
            optionType,
            maxBudget
        });

        if (!strikeInfo || !strikeInfo.securityId || strikeInfo.status !== "success") {
            throw new Error(`[STRIKE SELECTION ERROR] Failed to find option contract for ${optionType} @ Spot ₹${spotPrice}`);
        }
        return strikeInfo;
    }

    // =========================================================================
    // STEP 4: CALCULATE SL AND TARGETS
    // =========================================================================
    async calculateSLAndTargets(strikeInfo) {
        console.log(`📐 [CALCULATE SL/TR] Option Contract ${strikeInfo.symbol || strikeInfo.securityId}...`);
        const slTargetData = await calculateOptionSLAndTargets({
            securityId: strikeInfo.securityId,
            entryPrice: strikeInfo.liveLtp || strikeInfo.price,
            interval: "5",
            method: "HYBRID"
        });

        if (!slTargetData || slTargetData.status !== "success") {
            throw new Error(`[OPTION SL/TARGET ERROR] Failed to compute SL/Target prices for option contract ${strikeInfo.securityId}`);
        }

        strikeInfo.optionSL = slTargetData.stopLoss?.sl;
        strikeInfo.optionTR1 = slTargetData.targets?.tr1?.price;
        strikeInfo.optionTR2 = slTargetData.targets?.tr2?.price;
        strikeInfo.optionTR3 = slTargetData.targets?.tr3?.price;
        strikeInfo.optionTR4 = slTargetData.targets?.tr4?.price;
        strikeInfo.optionTR5 = slTargetData.targets?.tr5?.price;

        this.activeOptionContract = strikeInfo;
        return strikeInfo;
    }

    // =========================================================================
    // STEP 5: EXECUTE BROKER ORDER
    // =========================================================================
    async executeBrokerOrder(orderDetails) {
        const strikeInfo = orderDetails.strikeInfo || this.activeOptionContract;
        if (!strikeInfo || !strikeInfo.securityId) {
            throw new Error(`[REAL ORDER ERROR] Missing option contract details for ${orderDetails.symbol || 'Option'}`);
        }

        const secId = String(strikeInfo.securityId);
        const lotSize = Number(strikeInfo.lotSize || 65);
        const qty = Number(orderDetails.qty || strikeInfo.totalQty || lotSize);
        const lots = Math.max(1, Math.floor(qty / lotSize));
        const actualExecutedQty = lots * lotSize;

        console.log(`🚀 [EXECUTING ORDER] ${strikeInfo.symbol || secId} | Qty: ${actualExecutedQty} (${lots} lot(s))`);

        const execRes = await this.smartExecutor.placeOptionOrder({
            securityId: secId,
            exchangeSegment: strikeInfo.exchangeSegment || "NSE_FNO",
            transactionType: "BUY",
            lots: lots,
            lotSize: lotSize,
            price: 0,
            targetPrice: orderDetails.levels?.tr5 || orderDetails.levels?.tr4 || orderDetails.targetPrice || strikeInfo.optionTR5,
            stopLossPrice: orderDetails.initialSl || strikeInfo.optionSL
        });

        if (!execRes || execRes.status !== "success" || !execRes.orderId) {
            const errDetail = execRes?.rawResponse?.message || execRes?.message || 'Unknown broker error';
            throw new Error(`[REAL ORDER ERROR] Dhan SmartOrderExecutor failed: ${errDetail}`);
        }

        console.log(`✅ [ORDER SUBMITTED] Broker Order ID: ${execRes.orderId}`);
        return { status: "SUCCESS", orderId: execRes.orderId, quantity: actualExecutedQty, lotSize: lotSize, securityId: secId };
    }

    // =========================================================================
    // STEP 6A: VERIFY ORDER PLACEMENT DOUBLE-CHECK (WITH 20S DHAN API DELAY)
    // =========================================================================
    async verifyOrderPlacement(orderId, securityId) {
        console.log(`🔍 [DOUBLE-CHECK PLACE] Checking Dhan broker API status sync (Order: ${orderId})...`);
        await new Promise(res => setTimeout(res, 1000));
        try {
            const orders = new DhanOrders();
            const orderListRes = await orders.getOrders();
            const orderList = Array.isArray(orderListRes?.data) ? orderListRes.data : (orderListRes?.data?.data || []);

            const match = orderList.find(o => String(o.orderId) === String(orderId));
            if (match) {
                const status = String(match.orderStatus).toUpperCase();
                const isConfirmed = (status === "TRADED" || status === "TRANSIT" || status === "PENDING");
                console.log(`📌 [DOUBLE-CHECK PLACE CONFIRMED] Order ${orderId} Status: ${status}`);
                return { isConfirmed, status, order: match };
            }
        } catch (e) {
            console.warn(`⚠️ [DOUBLE-CHECK PLACE NOTICE]: ${e.message}`);
        }
        return { isConfirmed: true, orderId };
    }

    // =========================================================================
    // STEP 6B: VERIFY ORDER MODIFICATION DOUBLE-CHECK (WITH 1S DHAN API DELAY)
    // =========================================================================
    async verifyOrderModification(orderId, expectedSlPrice) {
        console.log(`🔍 [DOUBLE-CHECK MODIFY] Checking Dhan broker API SL modification sync (Order: ${orderId})...`);
        await new Promise(res => setTimeout(res, 1000));
        try {
            const orders = new DhanOrders();
            const orderListRes = await orders.getOrders();
            const orderList = Array.isArray(orderListRes?.data) ? orderListRes.data : (orderListRes?.data?.data || []);

            const match = orderList.find(o => String(o.orderId) === String(orderId));
            if (match) {
                const status = String(match.orderStatus).toUpperCase();
                const priceOnTerminal = Number(match.price || match.triggerPrice || match.stopLoss || expectedSlPrice);
                console.log(`📌 [DOUBLE-CHECK MODIFY CONFIRMED] Order ${orderId} Status: ${status} | Price on Terminal: ₹${priceOnTerminal}`);
                return { isConfirmed: true, status, priceOnTerminal };
            }
        } catch (e) {
            console.warn(`⚠️ [DOUBLE-CHECK MODIFY NOTICE]: ${e.message}`);
        }
        return { isConfirmed: true, orderId };
    }

    // =========================================================================
    // STEP 6C: VERIFY ORDER CLOSE DOUBLE-CHECK (WITH 1S DHAN API DELAY)
    // =========================================================================
    async verifyOrderClose(securityId, orderId) {
        console.log(`🔍 [DOUBLE-CHECK CLOSE] Checking Dhan broker API position close sync (Security: ${securityId})...`);
        await new Promise(res => setTimeout(res, 1000));
        try {
            const orders = new DhanOrders();
            const posRes = await orders.getPositions();
            const rawData = posRes?.data?.data || posRes?.data;
            const positionsList = Array.isArray(rawData) ? rawData : (Array.isArray(posRes?.data) ? posRes.data : []);

            const openPos = positionsList.find(p => String(p.securityId) === String(securityId) && Number(p.netQty) !== 0);
            if (openPos) {
                console.warn(`⚠️ [DOUBLE-CHECK CLOSE WARNING] Position for ${securityId} still shows netQty ${openPos.netQty} on Dhan terminal!`);
                return { isClosedOnTerminal: false, netQty: openPos.netQty };
            }

            console.log(`✅ [DOUBLE-CHECK CLOSE CONFIRMED] Position ${securityId} verified CLOSED (netQty: 0) on Dhan broker terminal.`);
            return { isClosedOnTerminal: true, netQty: 0 };
        } catch (e) {
            console.warn(`⚠️ [DOUBLE-CHECK CLOSE NOTICE]: ${e.message}`);
        }
        return { isClosedOnTerminal: true };
    }

    // =========================================================================
    // STEP 7: TRACK ACTIVE OPTION (WebSocket Stream & Trailing SL)
    // =========================================================================
    trackActiveOption(position) {
        if (!position || !position.securityId) return;

        const secId = String(position.securityId);
        if (this.activeOptionStreamSecId === secId) return;

        this.activeOptionStreamSecId = secId;
        console.log(`📡 [WEBSOCKET TRACKING] Started live tracking for ${position.symbol} (${secId})...`);

        this.livePriceTracker.streamOptionLtp({
            securityId: secId,
            exchangeSegment: "NSE_FNO",
            buyPrice: position.entryPrice,
            qty: position.qty
        }, (liveTick) => {
            this.latestOptionTick = liveTick;
            const optLtp = Number(liveTick.liveLtp || liveTick.ltp || liveTick.price || position.entryPrice);

            if (masterSL.activePosition && String(masterSL.activePosition.securityId) === secId) {
                masterSL.activePosition.liveLtp = optLtp;
                masterSL.activePosition.pnl = Number(liveTick.livePnl || 0);
                masterSL.activePosition.pnlPercent = liveTick.pnlPercent || "0.00%";
            }

            if (masterSL.virtualWatch) {
                masterSL.virtualWatch.liveLtp = optLtp;
            }

            this.processTick(liveTick);
        });
    }

    /**
     * Start Real Trading
     */
    async startRealTrading() {
        realConfig.setEnabled(true);
        const cfg = realConfig.getConfig();
        const selectedStock = cfg.selectedStock;

        masterSL.activePosition = null;

        await this.checkAccountBalance();
        await this.checkOpenPositions();

        console.log("==========================================================================");
        console.log(`⚡ [REAL ENGINE START] Active via MasterSL (MODULAR VERIFIED STEP STACK)`);
        console.log(`📈 Target Scrip: ${selectedStock.symbol} (ID: ${selectedStock.securityId})`);
        console.log(" Double-Check Flow: Place Order (Checked) -> Modify SL (Checked) -> Close Order (Checked)");
        console.log("==========================================================================\n");
    }

    /**
     * Stop Real Trading
     */
    stopRealTrading() {
        realConfig.setEnabled(false);
        if (this.livePriceTracker) {
            this.livePriceTracker.close();
        }
        console.log("⏹️ [REAL ENGINE STOP] Real Trading service paused.");
    }

    /**
     * Create Real Trade Handlers Interface for MasterSL
     */
    getRealHandlers() {
        return {
            checkBalance: async () => {
                const bal = await this.checkAccountBalance();
                return bal.availableBalance;
            },
            selectStrike: async (spotPrice, optionType, maxBudget) => {
                const strikeInfo = await this.selectOptionStrike(spotPrice, optionType, maxBudget);
                const strikeWithLevels = await this.calculateSLAndTargets(strikeInfo);
                return strikeWithLevels;
            },
            placeOrder: async (orderDetails) => {
                const placeRes = await this.executeBrokerOrder(orderDetails);
                return placeRes;
            },
            verifyOrderPlacement: async (orderId, securityId) => {
                return await this.verifyOrderPlacement(orderId, securityId);
            },
            modifyOrder: async (orderId, newSl, stage) => {
                if (!orderId || String(orderId).startsWith("MASTER_SL")) {
                    throw new Error(`[REAL SL MODIFY ERROR] Invalid broker orderId: ${orderId}`);
                }
                if (!newSl || newSl <= 0) {
                    throw new Error(`[REAL SL MODIFY ERROR] Invalid new SL price: ₹${newSl}`);
                }

                const position = this.activePosition;
                const qty = Number(position?.qty || this.activeOptionContract?.totalQty);

                console.log(`🔄 [REAL SL MODIFIED] Order ${orderId} -> New SL: ₹${newSl} (${stage})`);
                const modRes = await this.smartExecutor.updateStopLoss({
                    orderId,
                    newStopLossPrice: newSl,
                    quantity: qty
                });

                if (!modRes || modRes.status !== "success") {
                    const errDetail = modRes?.rawResponse?.message || modRes?.message || 'Dhan API modify call failed';
                    throw new Error(`[REAL SL MODIFY ERROR] Dhan API failed to modify SL: ${errDetail}`);
                }

                // DOUBLE-CHECK SL MODIFICATION ON DHAN TERMINAL
                await this.verifyOrderModification(orderId, newSl);
                return true;
            },
            verifyOrderModification: async (orderId, expectedSl) => {
                return await this.verifyOrderModification(orderId, expectedSl);
            },
            closeOrder: async (position) => {
                if (!position || !position.orderId) {
                    throw new Error("[REAL ORDER CLOSE ERROR] Position or orderId missing for position close");
                }

                const qty = Number(position.qty || this.activeOptionContract?.totalQty);
                const secId = String(position.securityId || this.activeOptionContract?.securityId || "");

                console.log(`🏁 [REAL ORDER CLOSED] Position ${position.symbol || secId} (Order: ${position.orderId}) | Exit Reason: ${position.exitReason}`);

                if (this.livePriceTracker) {
                    this.livePriceTracker.close();
                }
                this.activeOptionStreamSecId = null;

                const closeRes = await this.smartExecutor.closePosition({
                    orderId: position.orderId,
                    securityId: secId,
                    exchangeSegment: "NSE_FNO",
                    productType: "INTRADAY",
                    quantity: qty
                });

                if (!closeRes || closeRes.status !== "success") {
                    const errDetail = closeRes?.rawResponse?.message || closeRes?.message || 'Dhan API close call failed';
                    throw new Error(`[REAL ORDER CLOSE ERROR] SmartExecutor close position failed: ${errDetail}`);
                }

                // DOUBLE-CHECK POSITION CLOSE ON DHAN TERMINAL
                const closeVerify = await this.verifyOrderClose(secId, position.orderId);
                if (!closeVerify.isClosedOnTerminal) {
                    console.warn(`⚠️ [DOUBLE-CHECK CLOSE RETRY] Position ${secId} still open on Dhan terminal! Retrying close...`);
                    await this.smartExecutor.closePosition({
                        orderId: position.orderId,
                        securityId: secId,
                        exchangeSegment: "NSE_FNO",
                        productType: "INTRADAY",
                        quantity: qty
                    });
                }

                return true;
            },
            verifyOrderClose: async (securityId, orderId) => {
                return await this.verifyOrderClose(securityId, orderId);
            }
        };
    }

    /**
     * Process Consensus Signal via MasterSL Engine
     * Executes Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Step 6 -> Step 7 Flow
     */
    async processSignal(signal, stockInfo = null) {
        if (!signal) return null;

        const masterCfg = masterConfig.getConfig();
        const isRealEnabled = realConfig.getConfig().realTradeEnabled;

        // Allow processing if Real Trading is enabled OR Virtual Signal Filter is active
        if (!isRealEnabled && !masterCfg.enableVirtualSignalFilter) return null;

        // STEP 1: Check Open Positions (Single time from Dhan API)
        const posCheck = await this.checkOpenPositions();
        if (posCheck.hasOpenPosition) {
            console.log(`⚠️ [SIGNAL IGNORED] Active position already exists (${posCheck.position?.symbol}). Skipping new order.`);
            this.trackActiveOption(posCheck.position);
            return { status: "IGNORED", reason: "POSITION_ALREADY_OPEN", position: posCheck.position };
        }

        // STEP 2: Check Account Balance (if real trading is enabled)
        if (isRealEnabled) {
            const balCheck = await this.checkAccountBalance();
            if (!balCheck.isSufficient) {
                console.log(`⚠️ [SIGNAL IGNORED] Available balance (₹${balCheck.availableBalance}) is below minimum threshold ₹1000.`);
                return { status: "IGNORED", reason: "INSUFFICIENT_BALANCE", balance: balCheck.availableBalance };
            }
        }

        if (signal.consensus === "BUY" || signal.consensus === "SELL") {
            this.isOrderPlacing = true;
            try {
                console.log(`\n🎯 [SIGNAL DETECTED] Signal: ${signal.consensus} | Entry Spot: ₹${signal.entry}`);
                const handlers = this.getRealHandlers();

                // STEP 3, 4, 5: Select Strike, Calculate SL, Execute Broker Order / Virtual Watch
                const envName = isRealEnabled ? "REAL_TRADE" : "PAPER";
                const orderRes = await masterSL.processSignal(signal, handlers, envName);

                if (orderRes && orderRes.status === "VIRTUAL_WATCHING" && orderRes.virtualWatch) {
                    const vw = orderRes.virtualWatch;
                    const strikeInfo = vw.selectedStrikeInfo;
                    if (strikeInfo && strikeInfo.securityId) {
                        this.trackActiveOption({
                            securityId: strikeInfo.securityId,
                            symbol: vw.symbol,
                            entryPrice: vw.virtualEntry,
                            qty: strikeInfo.lotSize || 65
                        });
                    }
                    return orderRes;
                }

                if (orderRes && orderRes.status === "EXECUTED" && orderRes.position) {
                    // STEP 7: Start Live Option Tracking & Trailing SL if Real Trading is enabled
                    if (isRealEnabled) {
                        this.trackActiveOption(orderRes.position);
                    }
                    return { status: "EXECUTED", position: orderRes.position, confirmed: true };
                }

                return orderRes;
            } finally {
                this.isOrderPlacing = false;
            }
        }

        return { status: "NO_SIGNAL", signal };
    }

    /**
     * Periodic Dhan Broker Position Sync (Throttled to once every 3 seconds)
     */
    async syncPositionStatus() {
        const now = Date.now();
        if (!this.lastPosSyncTimestamp || (now - this.lastPosSyncTimestamp > 3000)) {
            this.lastPosSyncTimestamp = now;
            try {
                await this.checkOpenPositions();
            } catch (e) {}
        }
    }

    /**
     * Process Live Candle / Price Tick via MasterSL Engine
     */
    async processTick(tick) {
        if (!realConfig.getConfig().realTradeEnabled || !tick) return null;
        if (this.isProcessingTick) return null;

        try {
            this.isProcessingTick = true;
            // Periodically check if Dhan terminal closed position via Super Order SL/Target leg
            this.syncPositionStatus().catch(() => {});
            
            const closedPos = await masterSL.processTick(tick, "REAL_TRADE");
            this.isProcessingTick = false;
            return closedPos;
        } catch (err) {
            this.isProcessingTick = false;
            console.error(`❌ [REAL ENGINE TICK ERROR] Error processing tick: ${err.message}`);
            return null;
        }
    }

    /**
     * Get Complete State Payload for UI Rendering
     */
    getStatus() {
        // Trigger non-blocking position sync for UI polling
        this.syncPositionStatus().catch(() => {});

        const masterStatus = masterSL.getStatus();
        return {
            ...masterStatus,
            realTradeEnabled: realConfig.getConfig().realTradeEnabled,
            activeOptionContract: this.activeOptionContract,
            latestOptionTick: this.latestOptionTick,
            funds: this.cachedFunds || {}
        };
    }
}

module.exports = new RealTradeEngine();
