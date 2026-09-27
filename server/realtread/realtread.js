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
const masterSL = require('../masterSL/masterSL');

// Strict allowed modules stack only
const { selectBestOptionStrike } = require('../../utility/usedfull/select-best-strike');
const { calculateOptionSLAndTargets } = require('../../utility/usedfull/option-sl-target');
const { SmartOrderExecutor } = require('../../utility/usedfull/smart-order-executor');
const { DhanOptionLivePrice } = require('../../utility/dhan-option-live-price');
const { DhanFunds } = require('../../utility/dhan-funds');

class RealTradeEngine {
    constructor() {
        this.isProcessingTick = false;
        this.smartExecutor = new SmartOrderExecutor();
        this.livePriceTracker = new DhanOptionLivePrice();
        this.activeOptionContract = null;
        this.latestOptionTick = null;
        this.cachedFunds = null;
        this.fundsPollTimer = null;
        this.fetchLiveFunds();
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

    /**
     * Fetch Live Available Account Funds from Dhan API
     */
    async fetchLiveFunds() {
        try {
            const funds = new DhanFunds();
            const fundRes = await funds.getFundLimits();
            if (fundRes && fundRes.status === "success" && fundRes.data) {
                this.cachedFunds = fundRes.data;
            }
        } catch (e) {
            console.warn(`⚠️ [REAL FUNDS FETCH] Notice: ${e.message}`);
        }
        return this.cachedFunds;
    }

    /**
     * Start Real Trading
     */
    async startRealTrading() {
        realConfig.setEnabled(true);
        const cfg = realConfig.getConfig();
        const selectedStock = cfg.selectedStock;

        await this.fetchLiveFunds();
        if (this.fundsPollTimer) clearInterval(this.fundsPollTimer);
        this.fundsPollTimer = setInterval(() => this.fetchLiveFunds(), 5000);

        console.log("==========================================================================");
        console.log(`⚡ [REAL ENGINE START] Active via MasterSL (ONLY STACK UTILITIES USED)`);
        console.log(`📈 Target Scrip: ${selectedStock.symbol} (ID: ${selectedStock.securityId})`);
        console.log(" Modules Stack: select-best-strike | option-sl-target | smart-order-executor | dhan-option-live-price");
        console.log("==========================================================================\n");
    }

    /**
     * Stop Real Trading
     */
    stopRealTrading() {
        realConfig.setEnabled(false);
        if (this.fundsPollTimer) {
            clearInterval(this.fundsPollTimer);
            this.fundsPollTimer = null;
        }
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
                // Fetch 100% Real Live Available Balance from Dhan Funds API
                const { DhanFunds } = require("../../utility/dhan-funds");
                const funds = new DhanFunds();
                const fundRes = await funds.getFundLimits();

                if (fundRes.status !== "success" || !fundRes.data) {
                    throw new Error(`[REAL BALANCE ERROR] Failed to fetch Dhan account funds: ${fundRes?.message || 'Unknown broker error'}`);
                }

                const availableBalance = Number(fundRes.data.availabelBalance || fundRes.data.withdrawableBalance || 0);
                if (availableBalance <= 0) {
                    throw new Error(`[REAL BALANCE ERROR] Available Dhan balance is ₹${availableBalance}. Cannot place real trades with zero balance.`);
                }

                return availableBalance;
            },
            selectStrike: async (spotPrice, optionType, maxBudget) => {
                const cfg = realConfig.getConfig();
                const selectedStock = cfg.selectedStock || { securityId: 13, exchangeSegment: "IDX_I" };

                // 1. Module 1: select-best-strike.js (Live Dhan Option Chain Matrix)
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

                // 2. Module 2: option-sl-target.js (Live Option Price Action SL & Targets)
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
            },
            placeOrder: async (orderDetails) => {
                const strikeInfo = orderDetails.strikeInfo || this.activeOptionContract;
                if (!strikeInfo || !strikeInfo.securityId) {
                    throw new Error(`[REAL ORDER ERROR] Missing option contract details for ${orderDetails.symbol || 'Option'}`);
                }

                const secId = String(strikeInfo.securityId);
                const lotSize = Number(strikeInfo.lotSize);
                if (!lotSize || lotSize <= 0) {
                    throw new Error(`[REAL ORDER ERROR] Invalid lotSize (${strikeInfo.lotSize}) for option contract ${secId}`);
                }

                const qty = Number(orderDetails.qty || strikeInfo.totalQty);
                if (!qty || qty <= 0) {
                    throw new Error(`[REAL ORDER ERROR] Invalid order quantity (${qty}) for option contract ${secId}`);
                }

                const lots = Math.floor(qty / lotSize);
                if (lots < 1) {
                    throw new Error(`[REAL ORDER ERROR] Order quantity (${qty}) is smaller than contract lot size (${lotSize})`);
                }

                console.log(`🚀 [REAL ORDER PLACED] ${strikeInfo.symbol || secId} | Security ID: ${secId} | Qty: ${qty} (${lots} lot(s) @ ${lotSize}/lot)`);

                // 3. Module 3: smart-order-executor.js
                const execRes = await this.smartExecutor.placeOptionOrder({
                    securityId: secId,
                    exchangeSegment: strikeInfo.exchangeSegment || "NSE_FNO",
                    transactionType: "BUY",
                    lots: lots,
                    lotSize: lotSize,
                    price: 0, // MARKET Order
                    targetPrice: orderDetails.targetPrice || strikeInfo.optionTR4,
                    stopLossPrice: orderDetails.initialSl || strikeInfo.optionSL
                });

                if (!execRes || execRes.status !== "success" || !execRes.orderId) {
                    const errDetail = execRes?.rawResponse?.message || execRes?.message || 'Unknown broker error';
                    throw new Error(`[REAL ORDER ERROR] Dhan SmartOrderExecutor failed: ${errDetail}`);
                }

                console.log(`✅ [REAL ORDER SUCCESS] Broker Order ID: ${execRes.orderId}`);

                // 4. Module 4: dhan-option-live-price.js (Start WebSocket streaming for Option LTP)
                this.livePriceTracker.streamOptionLtp({
                    securityId: secId,
                    exchangeSegment: strikeInfo.exchangeSegment || "NSE_FNO",
                    buyPrice: execRes.entryPrice || orderDetails.entryPrice || strikeInfo.liveLtp,
                    qty: qty
                }, (liveTick) => {
                    this.latestOptionTick = liveTick;
                    this.processTick(liveTick);
                });

                return { status: "SUCCESS", orderId: execRes.orderId, quantity: qty, lotSize: lotSize, securityId: secId };
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
                if (!qty || qty <= 0) {
                    throw new Error(`[REAL SL MODIFY ERROR] Cannot determine order quantity for order ${orderId}`);
                }

                console.log(`🔄 [REAL SL MODIFIED] Order ${orderId} -> New SL: ₹${newSl} (${stage})`);

                // Module 3: smart-order-executor.js
                const modRes = await this.smartExecutor.updateStopLoss({
                    orderId,
                    newStopLossPrice: newSl,
                    quantity: qty
                });

                if (!modRes || modRes.status !== "success") {
                    const errDetail = modRes?.rawResponse?.message || modRes?.message || 'Dhan API modify call failed';
                    throw new Error(`[REAL SL MODIFY ERROR] Dhan API failed to modify SL: ${errDetail}`);
                }
                return true;
            },
            closeOrder: async (position) => {
                if (!position || !position.orderId) {
                    throw new Error("[REAL ORDER CLOSE ERROR] Position or orderId missing for position close");
                }

                const qty = Number(position.qty || this.activeOptionContract?.totalQty);
                if (!qty || qty <= 0) {
                    throw new Error(`[REAL ORDER CLOSE ERROR] Invalid exit quantity for position ${position.symbol || position.orderId}`);
                }

                const secId = String(position.securityId || this.activeOptionContract?.securityId || "");

                console.log(`🏁 [REAL ORDER CLOSED] Position ${position.symbol || secId} (Order: ${position.orderId}) | Exit Reason: ${position.exitReason}`);

                // Close live WebSocket feed for this option contract
                if (this.livePriceTracker) {
                    this.livePriceTracker.close();
                }

                // Module 3: smart-order-executor.js
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
                return true;
            }
        };
    }

    /**
     * Process Consensus Signal via MasterSL Engine
     */
    async processSignal(signal, stockInfo = null) {
        if (!realConfig.getConfig().realTradeEnabled || !signal) return null;

        if (signal.consensus === "BUY" || signal.consensus === "SELL") {
            console.log(`\n🎯 [REAL SIGNAL DETECTED] Signal: ${signal.consensus} | Entry Spot: ₹${signal.entry}`);
            const handlers = this.getRealHandlers();
            const res = await masterSL.processSignal(signal, handlers, "REAL_TRADE");
            return res;
        }

        return { status: "NO_SIGNAL", signal };
    }

    /**
     * Process Live Candle / Price Tick via MasterSL Engine
     * Evaluates Trailing SL stages and Exits for Real Trading
     * 
     * @param {Object} tick - Current market tick { high, low, close, price }
     * @returns {Promise<Object|null>} Closed position if exited
     */
    async processTick(tick) {
        if (!realConfig.getConfig().realTradeEnabled || !tick) return null;
        if (this.isProcessingTick) return null;

        try {
            this.isProcessingTick = true;
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
