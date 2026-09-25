/**
 * Dhan Orders & Execution Module
 * Location: C:\AlgoTrade\utility\dhan-orders.js
 * 
 * Supports:
 * - Regular Orders (place, modify, cancel, list, getById)
 * - Trade History (getTradeHistory, getTradeByOrderId)
 * - Slice Orders (placeSliceOrder)
 * - Super / Bracket Orders (placeSuperOrder, modifySuperOrder, cancelSuperOrder, getSuperOrders)
 * - Forever / GTT Orders (placeForeverOrder, modifyForeverOrder, cancelForeverOrder, getForeverOrders)
 */

const config = require("./token/config");

class DhanOrders {
    constructor(options = {}) {
        this.options = options;
    }

    getAuth() {
        try {
            delete require.cache[require.resolve("./token/config")];
            const freshConfig = require("./token/config");
            return {
                clientId: this.options.clientId || freshConfig.CLIENT_ID,
                accessToken: this.options.accessToken || freshConfig.ACCESS_TOKEN,
                baseUrl: this.options.baseUrl || freshConfig.BASE_URL
            };
        } catch (e) {
            return {
                clientId: this.options.clientId || config.CLIENT_ID,
                accessToken: this.options.accessToken || config.ACCESS_TOKEN,
                baseUrl: this.options.baseUrl || config.BASE_URL
            };
        }
    }

    getHeaders() {
        const auth = this.getAuth();
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "access-token": auth.accessToken,
            "client-id": auth.clientId
        };
    }

    async request(endpoint, options = {}) {
        const auth = this.getAuth();
        const url = `${auth.baseUrl}${endpoint}`;
        const fetchOptions = {
            method: options.method || "GET",
            headers: { ...this.getHeaders(), ...(options.headers || {}) }
        };

        if (options.body) {
            const bodyObj = typeof options.body === "object" ? { dhanClientId: auth.clientId, ...options.body } : options.body;
            fetchOptions.body = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);
        }

        try {
            const response = await fetch(url, fetchOptions);
            const data = await response.json();

            if (!response.ok) {
                return {
                    status: "error",
                    statusCode: response.status,
                    message: data.remarks?.error_message || data.message || "API call failed",
                    errorData: data
                };
            }
            return { status: "success", statusCode: response.status, data };
        } catch (error) {
            return { status: "error", message: error.message || "Network error" };
        }
    }

    // --- Regular Orders ---
    async placeOrder(params = {}) {
        return await this.request("/orders", {
            method: "POST",
            body: {
                dhanClientId: this.clientId,
                correlationId: params.correlationId || `ORD_${Date.now()}`,
                transactionType: params.transactionType,
                exchangeSegment: params.exchangeSegment,
                productType: params.productType,
                orderType: params.orderType,
                validity: params.validity || "DAY",
                tradingSymbol: params.tradingSymbol || "",
                securityId: params.securityId,
                quantity: params.quantity,
                disclosedQuantity: params.disclosedQuantity || 0,
                price: params.price || 0,
                triggerPrice: params.triggerPrice || 0,
                afterMarketOrder: params.afterMarketOrder || false,
                amoTime: params.amoTime || "OPEN",
                boProfitValue: params.boProfitValue || 0,
                boStopLossValue: params.boStopLossValue || 0
            }
        });
    }

    async modifyOrder(orderId, params = {}) {
        return await this.request(`/orders/${orderId}`, {
            method: "PUT",
            body: {
                dhanClientId: this.clientId,
                orderId: orderId,
                orderType: params.orderType,
                quantity: params.quantity,
                price: params.price || 0,
                triggerPrice: params.triggerPrice || 0,
                disclosedQuantity: params.disclosedQuantity || 0,
                validity: params.validity || "DAY"
            }
        });
    }

    async cancelOrder(orderId) {
        return await this.request(`/orders/${orderId}`, { method: "DELETE" });
    }

    async getOrderList() {
        return await this.request("/orders", { method: "GET" });
    }

    async getOrderById(orderId) {
        return await this.request(`/orders/${orderId}`, { method: "GET" });
    }

    // --- Trades ---
    async getTradeHistory() {
        return await this.request("/trades", { method: "GET" });
    }

    async getTradeByOrderId(orderId) {
        return await this.request(`/trades/${orderId}`, { method: "GET" });
    }

    // --- Slice Orders ---
    async placeSliceOrder(params = {}) {
        return await this.request("/orders/slicing", {
            method: "POST",
            body: {
                dhanClientId: this.clientId,
                transactionType: params.transactionType,
                exchangeSegment: params.exchangeSegment,
                productType: params.productType,
                orderType: params.orderType,
                validity: params.validity || "DAY",
                securityId: params.securityId,
                quantity: params.quantity,
                price: params.price || 0,
                triggerPrice: params.triggerPrice || 0
            }
        });
    }

    // --- Super / Bracket Orders ---
    async placeSuperOrder(params = {}) {
        return await this.request("/super/orders", {
            method: "POST",
            body: {
                dhanClientId: this.clientId,
                correlationId: params.correlationId || `SUPER_${Date.now()}`,
                transactionType: params.transactionType,
                exchangeSegment: params.exchangeSegment,
                productType: params.productType || "INTRADAY",
                orderType: params.orderType || "LIMIT",
                securityId: params.securityId,
                quantity: params.quantity,
                price: params.price,
                targetPrice: params.targetPrice,
                stopLossPrice: params.stopLossPrice,
                trailingJump: params.trailingJump || 0
            }
        });
    }

    async modifySuperOrder(superOrderId, params = {}) {
        return await this.request(`/super/orders/${superOrderId}`, {
            method: "PUT",
            body: {
                dhanClientId: this.clientId,
                orderId: superOrderId,
                orderType: params.orderType || "LIMIT",
                legName: params.legName || "TARGET_LEG",
                quantity: params.quantity,
                price: params.price || 0,
                targetPrice: params.targetPrice || params.price || 0,
                stopLossPrice: params.stopLossPrice || params.stopLoss || 0
            }
        });
    }

    async cancelSuperOrder(superOrderId, legName = "ENTRY_LEG") {
        return await this.request(`/super/orders/${superOrderId}/${legName}`, { method: "DELETE" });
    }

    async getSuperOrders() {
        return await this.request("/super/orders", { method: "GET" });
    }

    // --- Forever / GTT Orders ---
    async placeForeverOrder(params = {}) {
        return await this.request("/forever/orders", {
            method: "POST",
            body: {
                dhanClientId: this.clientId,
                orderFlag: params.orderFlag || "SINGLE",
                transactionType: params.transactionType,
                exchangeSegment: params.exchangeSegment,
                productType: params.productType || "CNC",
                orderType: params.orderType || "LIMIT",
                validity: "DAY",
                securityId: params.securityId,
                quantity: params.quantity,
                price: params.price,
                triggerPrice: params.triggerPrice,
                price1: params.price1 || 0,
                triggerPrice1: params.triggerPrice1 || 0
            }
        });
    }

    async modifyForeverOrder(orderId, params = {}) {
        return await this.request(`/forever/orders/${orderId}`, {
            method: "PUT",
            body: params
        });
    }

    async cancelForeverOrder(orderId) {
        return await this.request(`/forever/orders/${orderId}`, { method: "DELETE" });
    }

    async getForeverOrders() {
        return await this.request("/forever/orders", { method: "GET" });
    }
}

module.exports = {
    DhanOrders
};
