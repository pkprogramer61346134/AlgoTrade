/**
 * Smart Order Executor & Position Manager Utility
 * Location: C:\AlgoTrade\utility\usedfull\smart-order-executor.js
 * 
 * Functions Provided:
 * 1. placeOptionOrder()   - Places Regular or Super/Bracket Order with Target (TR) & StopLoss (SL).
 * 2. updateStopLoss()     - Updates active order Stop Loss price/points.
 * 3. updateTarget()       - Updates active order Target price/points.
 * 4. closePosition()      - Squares off active position / cancels active order.
 * 5. getLiveActivePosition() - Fetches live position details & Dhan server unrealized PnL.
 */

const { DhanOrders } = require("../dhan-orders");
const { DhanPosition } = require("../dhan-position");

class SmartOrderExecutor {
    constructor(options = {}) {
        this.orders = new DhanOrders(options);
        this.positions = new DhanPosition(options);
    }

    /**
     * 1. Place Option Order (Supports Target TR & StopLoss SL)
     * 
     * @param {Object} params
     * @param {string|number} params.securityId - Dhan Option Contract Security ID (e.g. "74003")
     * @param {string} [params.exchangeSegment="NSE_FNO"] - Exchange Segment (Default: "NSE_FNO")
     * @param {string} [params.transactionType="BUY"] - "BUY" or "SELL"
     * @param {number} [params.lots=1] - Number of lots (Default: 1)
     * @param {number} [params.lotSize=65] - Quantity per lot (Default: 65)
     * @param {number} [params.price=0] - Limit price (0 for MARKET order)
     * @param {number} [params.targetPrice=0] - Target / Take Profit Price (TR)
     * @param {number} [params.targetPoints=0] - Target points above entry price
     * @param {number} [params.stopLossPrice=0] - Stop Loss Price (SL)
     * @param {number} [params.stopLossPoints=0] - Stop Loss points below entry price
     * @returns {Promise<Object>} Order Placement Result
     */
    async placeOptionOrder(params = {}) {
        const securityId = String(params.securityId || "");
        const exchangeSegment = params.exchangeSegment || "NSE_FNO";
        const transactionType = String(params.transactionType || "BUY").toUpperCase();
        
        if (!securityId || securityId === "undefined" || securityId === "null") {
            throw new Error("[ORDER EXECUTOR ERROR] securityId is required to place an order");
        }

        const lots = Number(params.lots);
        if (!lots || lots < 1) {
            throw new Error(`[ORDER EXECUTOR ERROR] Valid number of lots required to place order, got: ${params.lots}`);
        }

        const lotSize = Number(params.lotSize);
        if (!lotSize || lotSize < 1) {
            throw new Error(`[ORDER EXECUTOR ERROR] Valid lotSize required to place order, got: ${params.lotSize}`);
        }

        const quantity = lots * lotSize;
        const price = Number(params.price || params.limitPrice || 0);

        // Calculate Target Price
        let targetPrice = Number(params.targetPrice || 0);
        if (!targetPrice && params.targetPoints && price > 0) {
            targetPrice = Number((price + Number(params.targetPoints)).toFixed(2));
        }

        // Calculate StopLoss Price
        let stopLossPrice = Number(params.stopLossPrice || 0);
        if (!stopLossPrice && params.stopLossPoints && price > 0) {
            stopLossPrice = Number((price - Number(params.stopLossPoints)).toFixed(2));
        }

        // If Target & StopLoss are specified, use Dhan Super/Bracket Order
        if (targetPrice > 0 && stopLossPrice > 0) {
            const superRes = await this.orders.placeSuperOrder({
                transactionType,
                exchangeSegment,
                productType: "INTRADAY",
                orderType: price > 0 ? "LIMIT" : "MARKET",
                securityId,
                quantity,
                price: price > 0 ? price : undefined,
                targetPrice,
                stopLossPrice,
                trailingJump: params.trailingJump || 0
            });

            if (!superRes || superRes.status !== "success" || !superRes.data?.orderId) {
                const errMsg = superRes?.message || superRes?.rawResponse?.remarks || superRes?.remarks || "Dhan Super Order placement failed";
                throw new Error(`[ORDER EXECUTOR ERROR] ${errMsg}`);
            }

            return {
                status: "success",
                orderType: "SUPER_ORDER",
                orderId: superRes.data.orderId,
                securityId,
                transactionType,
                quantity,
                lots,
                lotSize,
                entryPrice: price,
                targetPrice,
                stopLossPrice,
                rawResponse: superRes
            };
        }

        // Otherwise place Regular Order
        const regRes = await this.orders.placeOrder({
            transactionType,
            exchangeSegment,
            productType: "INTRADAY",
            orderType: price > 0 ? "LIMIT" : "MARKET",
            securityId,
            quantity,
            price
        });

        if (!regRes || regRes.status !== "success" || !regRes.data?.orderId) {
            const errMsg = regRes?.message || regRes?.remarks || "Dhan Regular Order placement failed";
            throw new Error(`[ORDER EXECUTOR ERROR] ${errMsg}`);
        }

        return {
            status: "success",
            orderType: "REGULAR_ORDER",
            orderId: regRes.data.orderId,
            securityId,
            transactionType,
            quantity,
            lots,
            lotSize,
            entryPrice: price,
            targetPrice: 0,
            stopLossPrice: 0,
            rawResponse: regRes
        };
    }

    /**
     * 2. Update Stop Loss (SL) for an Active Order
     * 
     * @param {Object} params
     * @param {string|number} params.orderId - Super Order ID or Order ID
     * @param {number} params.newStopLossPrice - New SL Price
     * @param {number} params.quantity - Order Quantity
     * @param {number} [params.price] - Current price
     * @returns {Promise<Object>} Modification Result
     */
    async updateStopLoss(params = {}) {
        const orderId = String(params.orderId || params.superOrderId || "");
        const newStopLossPrice = Number(params.newStopLossPrice || params.stopLossPrice);
        const quantity = Number(params.quantity);
        const price = Number(params.price || 0);

        if (!orderId) {
            throw new Error("[ORDER EXECUTOR ERROR] orderId is required to update Stop Loss");
        }
        if (!newStopLossPrice || newStopLossPrice <= 0) {
            throw new Error("[ORDER EXECUTOR ERROR] Valid newStopLossPrice is required");
        }
        if (!quantity || quantity <= 0) {
            throw new Error("[ORDER EXECUTOR ERROR] Valid order quantity is required to update Stop Loss");
        }

        const res = await this.orders.modifySuperOrder(orderId, {
            legName: "STOP_LOSS_LEG",
            quantity,
            price,
            stopLossPrice: newStopLossPrice
        });

        if (!res || res.status !== "success") {
            throw new Error(`[ORDER EXECUTOR ERROR] Dhan API modify SL failed: ${res?.message || res?.remarks || 'Unknown error'}`);
        }

        return {
            status: "success",
            action: "UPDATE_STOP_LOSS",
            orderId,
            newStopLossPrice,
            quantity,
            rawResponse: res
        };
    }

    /**
     * 3. Update Target (TR) for an Active Order
     * 
     * @param {Object} params
     * @param {string|number} params.orderId - Super Order ID or Order ID
     * @param {number} params.newTargetPrice - New Target Price
     * @param {number} params.quantity - Order Quantity
     * @returns {Promise<Object>} Modification Result
     */
    async updateTarget(params = {}) {
        const orderId = String(params.orderId || params.superOrderId || "");
        const newTargetPrice = Number(params.newTargetPrice || params.targetPrice);
        const quantity = Number(params.quantity);

        if (!orderId) {
            throw new Error("[ORDER EXECUTOR ERROR] orderId is required to update Target");
        }
        if (!newTargetPrice || newTargetPrice <= 0) {
            throw new Error("[ORDER EXECUTOR ERROR] Valid newTargetPrice is required");
        }
        if (!quantity || quantity <= 0) {
            throw new Error("[ORDER EXECUTOR ERROR] Valid order quantity is required to update Target");
        }

        const res = await this.orders.modifySuperOrder(orderId, {
            legName: "TARGET_LEG",
            quantity,
            price: newTargetPrice,
            targetPrice: newTargetPrice
        });

        if (!res || res.status !== "success") {
            throw new Error(`[ORDER EXECUTOR ERROR] Dhan API modify Target failed: ${res?.message || res?.remarks || 'Unknown error'}`);
        }

        return {
            status: "success",
            action: "UPDATE_TARGET",
            orderId,
            newTargetPrice,
            quantity,
            rawResponse: res
        };
    }

    /**
     * 4. Close Position / Exit Order
     * 
     * @param {Object} params
     * @param {string|number} [params.orderId] - Super Order ID or Order ID to cancel
     * @param {string|number} [params.securityId] - Option Security ID to square off
     * @param {number} params.quantity - Exit quantity
     * @param {string} [params.exchangeSegment="NSE_FNO"] - Exchange Segment
     * @returns {Promise<Object>} Close Position Result
     */
    async closePosition(params = {}) {
        const orderId = params.orderId || params.superOrderId;
        const securityId = params.securityId;
        const quantity = Number(params.quantity);
        const exchangeSegment = params.exchangeSegment || "NSE_FNO";

        if (orderId) {
            try {
                const cancelRes = await this.orders.cancelSuperOrder(orderId, "ENTRY_LEG");
                if (cancelRes && cancelRes.status === "success") {
                    return {
                        status: "success",
                        action: "CLOSE_SUPER_ORDER",
                        orderId,
                        rawResponse: cancelRes
                    };
                }
            } catch (err) {
                console.warn(`⚠️ [ORDER EXECUTOR WARN] Super order ${orderId} entry cancel notice: ${err.message}. Attempting market exit...`);
            }
        }

        if (securityId) {
            if (!quantity || quantity <= 0) {
                throw new Error("[ORDER EXECUTOR ERROR] Valid quantity is required to square off position");
            }
            const exitRes = await this.orders.placeOrder({
                transactionType: "SELL",
                exchangeSegment,
                productType: "INTRADAY",
                orderType: "MARKET",
                securityId: String(securityId),
                quantity,
                price: 0
            });

            if (!exitRes || exitRes.status !== "success") {
                const errDetail = exitRes?.message || exitRes?.remarks || 'Unknown broker error';
                throw new Error(`[ORDER EXECUTOR ERROR] Dhan API market exit order failed: ${errDetail}`);
            }

            return {
                status: "success",
                action: "EXIT_POSITION_SELL",
                securityId,
                quantity,
                rawResponse: exitRes
            };
        }

        throw new Error("[ORDER EXECUTOR ERROR] Either valid orderId or securityId with quantity is required to close position");
    }

    /**
     * 5. Get Live Active Positions & Dhan Server Unrealized PnL
     * 
     * @param {string|number} [securityId] - Security ID to filter active position (Optional)
     * @returns {Promise<Object>} Live Position details
     */
    async getLiveActivePosition(securityId = null) {
        const posRes = await this.positions.getPosition();
        if (posRes.status !== "success" || !Array.isArray(posRes.data)) {
            return { status: "error", message: posRes.message || "Failed to fetch live positions" };
        }

        const secIdStr = securityId ? String(securityId) : null;
        const activePositions = posRes.data.filter(p => p.netQty !== 0);

        if (secIdStr) {
            const match = activePositions.find(p => String(p.securityId) === secIdStr);
            return {
                status: "success",
                found: !!match,
                position: match || null
            };
        }

        return {
            status: "success",
            activeCount: activePositions.length,
            positions: activePositions
        };
    }
}

module.exports = {
    SmartOrderExecutor
};
