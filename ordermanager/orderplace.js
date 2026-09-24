const { DhanSDK } = require('../dhanAPI');

/**
 * ORDER PLACE MANAGER
 * 
 * Class responsible for:
 * 1. placeOrderWithSlTp - Submitting MARKET BUY Order to Dhan API with SL & TP.
 * 2. updateTrailingSl - Updating Trailing SL progressively based on live option LTP.
 * 3. closeOrder - Submitting MARKET SELL Exit Order to Dhan API to close position.
 */
class OrderPlace {
    constructor() {
        this.dhan = new DhanSDK();
        this.trailingRatioSteps = [1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
    }

    /**
     * Function 1: Places MARKET BUY Order on Dhan API with Initial SL & Target Profit (TP)
     * 
     * @param {Object} optionDetails - { symbol, securityId, liveLtp, optionType, strikePrice, qty }
     * @param {number} [riskPoints=15.0] - SL risk points per share
     * @param {number} [rrRatio=2.2] - Risk-to-Reward ratio for Target Profit
     * @returns {Promise<Object>} Active position state object
     */
    async placeOrderWithSlTp(optionDetails, riskPoints = 15.0, rrRatio = 2.2) {
        if (!optionDetails || !optionDetails.securityId) {
            throw new Error(`[ORDER PLACE ERROR] Invalid option details provided.`);
        }

        const symbol = optionDetails.symbol;
        const securityId = String(optionDetails.securityId);
        const qty = optionDetails.qty || 65; // Default 1 Lot = 65 Qty
        const entryPrice = Number((optionDetails.liveLtp || optionDetails.entryPrice || 0).toFixed(2));

        if (entryPrice <= 0) {
            throw new Error(`[ORDER PLACE ERROR] Invalid entry price: ₹${entryPrice}`);
        }

        // 1. Submit REAL MARKET BUY Order to Dhan API
        let orderId = `ORD_${Date.now()}`;
        if (this.dhan && typeof this.dhan.orders?.placeOrder === 'function') {
            console.log(`🚀 [ORDER PLACE] Submitting REAL Market BUY order for ${symbol} (SecID: ${securityId}, Qty: ${qty})...`);
            const res = await this.dhan.orders.placeOrder({
                transactionType: 'BUY',
                exchangeSegment: 'NSE_FNO',
                productType: 'INTRADAY',
                orderType: 'MARKET',
                validity: 'DAY',
                securityId: securityId,
                quantity: qty,
                price: 0
            });

            console.log(`📩 [DHAN BUY ORDER RESPONSE]:`, JSON.stringify(res, null, 2));

            if (res && (res.status === 'success' || res.orderId || res.data?.orderId)) {
                orderId = res.orderId || res.data?.orderId || orderId;
                console.log(`✅ [ORDER PLACE SUCCESS] Order ID: ${orderId}`);
            } else {
                const errMsg = res?.errorData?.errorMessage || res?.message || 'Dhan API order rejected';
                throw new Error(`[DHAN ORDER REJECTED] ${errMsg}`);
            }
        }

        // 2. Calculate SL & Target Profit (TP)
        const rawSL = entryPrice - riskPoints;
        const initialSL = Number((rawSL > 0 ? rawSL : Math.max(0.50, entryPrice * 0.5)).toFixed(2));
        const targetProfit = Number((entryPrice + (riskPoints * rrRatio)).toFixed(2));

        const activePosition = {
            orderId,
            symbol,
            securityId,
            optionType: optionDetails.optionType || 'CE',
            strikePrice: optionDetails.strikePrice || 0,
            qty,
            entryPrice,
            currentLtp: entryPrice,
            initialSL,
            currentTrailingSL: initialSL,
            targetProfit,
            highestPriceSeen: entryPrice,
            riskPoints,
            currentMilestoneIndex: -1,
            currentRatioText: '1:0',
            unrealizedPnl: 0.0,
            openedAt: new Date().toLocaleTimeString()
        };

        return activePosition;
    }

    /**
     * Function 2: Updates Trailing SL progressively based on live option LTP
     * 
     * @param {Object} activePosition - Active position object
     * @param {number} currentLtp - Current live option LTP
     * @returns {Object} Updated activePosition object
     */
    updateTrailingSl(activePosition, currentLtp) {
        if (!activePosition || !currentLtp || currentLtp <= 0) return activePosition;

        activePosition.currentLtp = Number(currentLtp.toFixed(2));
        const pnlPerShare = activePosition.currentLtp - activePosition.entryPrice;
        activePosition.unrealizedPnl = Number((pnlPerShare * activePosition.qty).toFixed(2));

        // Update peak price seen
        if (activePosition.currentLtp > activePosition.highestPriceSeen) {
            activePosition.highestPriceSeen = activePosition.currentLtp;
        }

        // Evaluate Trailing SL Progression steps (1:1.5, 1:2.5, 1:3...)
        const riskPts = activePosition.riskPoints && activePosition.riskPoints > 0 ? activePosition.riskPoints : 15.0;
        const gainedPoints = activePosition.highestPriceSeen - activePosition.entryPrice;
        const currentRRRatio = gainedPoints / riskPts;

        for (let i = this.trailingRatioSteps.length - 1; i >= 0; i--) {
            const milestoneRatio = this.trailingRatioSteps[i];
            if (currentRRRatio >= milestoneRatio && i > activePosition.currentMilestoneIndex) {
                activePosition.currentMilestoneIndex = i;
                activePosition.currentRatioText = `1:${milestoneRatio}`;

                // 1R Breathing Room formula
                const lockedRRatio = Math.max(0, milestoneRatio - 1.0);
                const newTrailingSL = Number((activePosition.entryPrice + (lockedRRatio * activePosition.riskPoints)).toFixed(2));

                if (newTrailingSL > activePosition.currentTrailingSL) {
                    const oldSL = activePosition.currentTrailingSL;
                    activePosition.currentTrailingSL = newTrailingSL;
                    console.log(`📈 [ORDER PLACE TRAIL] Milestone ${activePosition.currentRatioText} Reached! Trailing SL: ₹${oldSL} ➔ ₹${newTrailingSL}`);
                }
                break;
            }
        }

        return activePosition;
    }

    /**
     * Function 3: Closes Last/Active Order by submitting MARKET SELL Exit Order to Dhan API
     * 
     * @param {Object} activePosition - Active position object to close
     * @param {string} [reason="MANUAL_EXIT"] - Exit reason
     * @returns {Promise<Object>} Closed position summary object
     */
    async closeOrder(activePosition, reason = "MANUAL_EXIT") {
        if (!activePosition || !activePosition.securityId) {
            throw new Error(`[CLOSE ORDER ERROR] No active position available to close.`);
        }

        const securityId = String(activePosition.securityId);
        const qty = activePosition.qty;

        // 1. Submit REAL MARKET SELL Exit Order to Dhan API
        if (this.dhan && typeof this.dhan.orders?.placeOrder === 'function') {
            console.log(`🚀 [ORDER PLACE EXIT] Submitting REAL Exit SELL order for ${activePosition.symbol} (SecID: ${securityId})...`);
            const exitRes = await this.dhan.orders.placeOrder({
                transactionType: 'SELL',
                exchangeSegment: 'NSE_FNO',
                productType: 'INTRADAY',
                orderType: 'MARKET',
                validity: 'DAY',
                securityId: securityId,
                quantity: qty,
                price: 0
            });

            console.log(`📩 [DHAN EXIT ORDER RESPONSE]:`, JSON.stringify(exitRes, null, 2));

            if (exitRes && (exitRes.status === 'success' || exitRes.orderId || exitRes.data?.orderId)) {
                console.log(`✅ [EXIT ORDER SUCCESS] Exit Order ID: ${exitRes.orderId || exitRes.data?.orderId}`);
            } else {
                const errMsg = exitRes?.errorData?.errorMessage || exitRes?.message || 'Dhan exit order rejected';
                console.warn(`⚠️ [DHAN EXIT WARNING]: ${errMsg}`);
            }
        }

        const exitPrice = activePosition.currentLtp;
        const pnlPerShare = exitPrice - activePosition.entryPrice;
        const netPnl = Number((pnlPerShare * qty).toFixed(2));

        const closedSummary = {
            ...activePosition,
            exitPrice,
            netPnl,
            reason,
            closedAt: new Date().toLocaleTimeString()
        };

        console.log(`🏁 [ORDER PLACE CLOSED] ${activePosition.symbol} | Entry: ₹${activePosition.entryPrice} | Exit: ₹${exitPrice} | Net PnL: ₹${netPnl} | Reason: ${reason}`);
        return closedSummary;
    }
}

module.exports = OrderPlace;
