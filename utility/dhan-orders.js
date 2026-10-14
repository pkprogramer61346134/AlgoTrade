/**
 * Dhan Orders & Execution Module
 * Location: C:\AlgoTrade\utility\dhan-orders.js
 *
 * Supports:
 * - Regular Orders (place, modify, cancel, list, getById)
 * - Trade History (getTradeHistory, getTradeByOrderId)
 * - Slice Orders (placeSliceOrder)
 * - Super Orders (placeSuperOrder, modifySuperOrder, cancelSuperOrder, getSuperOrders)
 * - Forever / GTT Orders (placeForeverOrder, modifyForeverOrder, cancelForeverOrder, getForeverOrders)
 *
 * Dhan V2 Endpoints:
 *   Regular : /orders
 *   Super   : /superorder
 *   Forever : /forever/orders
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
            let bodyObj = typeof options.body === "object" ? { ...options.body } : options.body;
            if (typeof bodyObj === "object" && bodyObj !== null) {
                if (!bodyObj.dhanClientId || bodyObj.dhanClientId === "undefined") {
                    bodyObj.dhanClientId = auth.clientId;
                }
            }
            fetchOptions.body = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);
        }

        try {
            const response = await fetch(url, fetchOptions);
            let data = null;
            try {
                data = await response.json();
            } catch (jsonErr) {
                data = { rawText: await response.text().catch(() => "") };
            }

            if (!response.ok) {
                console.error(`[DHAN API ERROR] ${fetchOptions.method} ${endpoint} → HTTP ${response.status}`);
                console.error(`[DHAN API ERROR BODY]`, JSON.stringify(data, null, 2));
                return {
                    status: "error",
                    statusCode: response.status,
                    message: data?.remarks?.error_message || data?.errorMessage || data?.remarks || data?.message || `HTTP ${response.status} - API call failed`,
                    errorData: data
                };
            }

            if (data && (data.orderStatus === "REJECTED" || data.orderStatus === "CANCELLED" || data.status === "FAILURE")) {
                return {
                    status: "error",
                    statusCode: response.status,
                    message: data.remarks?.error_message || data.errorMessage || data.remarks || data.message || `Order ${data.orderStatus || 'Failed'}`,
                    errorData: data
                };
            }

            return { status: "success", statusCode: response.status, data };
        } catch (error) {
            console.error(`[DHAN API NETWORK ERROR] ${fetchOptions.method} ${endpoint} → ${error.message}`);
            return { status: "error", message: error.message || "Network error" };
        }
    }

    // --- Regular Orders ---
    async placeOrder(params = {}) {
        const auth = this.getAuth();
        return await this.request("/orders", {
            method: "POST",
            body: {
                dhanClientId: auth.clientId,
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
        const auth = this.getAuth();
        return await this.request(`/orders/${orderId}`, {
            method: "PUT",
            body: {
                dhanClientId: auth.clientId,
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

    async getOrders() {
        return await this.getOrderList();
    }

    async getOrderById(orderId) {
        return await this.request(`/orders/${orderId}`, { method: "GET" });
    }

    async getPositions() {
        return await this.request("/positions", { method: "GET" });
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
        const auth = this.getAuth();
        return await this.request("/orders/slicing", {
            method: "POST",
            body: {
                dhanClientId: auth.clientId,
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

    // --- Super Orders (Dhan V2: /superorder) ---
    async placeSuperOrder(params = {}) {
        const auth = this.getAuth();
        return await this.request("/superorder", {
            method: "POST",
            body: {
                dhanClientId: auth.clientId,
                correlationId: params.correlationId || `SUPER_${Date.now()}`,
                transactionType: params.transactionType,
                exchangeSegment: params.exchangeSegment,
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
        const auth = this.getAuth();
        const legName = params.legName || "STOP_LOSS_LEG";
        const bodyObj = {
            dhanClientId: auth.clientId,
            orderId: String(superOrderId),
            orderType: params.orderType || "LIMIT",
            legName: legName,
            quantity: Number(params.quantity),
            price: Number(params.price || 0)
        };

        if (legName === "STOP_LOSS_LEG" || params.stopLossPrice) {
            bodyObj.stopLossPrice = Number(params.stopLossPrice || params.price || 0);
            if (!bodyObj.price || bodyObj.price <= 0) {
                bodyObj.price = bodyObj.stopLossPrice;
            }
        }
        if (legName === "TARGET_LEG" || params.targetPrice) {
            bodyObj.targetPrice = Number(params.targetPrice || params.price || 0);
            if (!bodyObj.price || bodyObj.price <= 0) {
                bodyObj.price = bodyObj.targetPrice;
            }
        }

        return await this.request(`/superorder/${superOrderId}`, {
            method: "PUT",
            body: bodyObj
        });
    }

    async cancelSuperOrder(superOrderId, legName = "ENTRY_LEG") {
        return await this.request(`/superorder/${superOrderId}?legName=${legName}`, { method: "DELETE" });
    }

    async getSuperOrders() {
        return await this.request("/superorder", { method: "GET" });
    }

    // --- Forever / GTT Orders ---
    async placeForeverOrder(params = {}) {
        const auth = this.getAuth();
        return await this.request("/forever/orders", {
            method: "POST",
            body: {
                dhanClientId: auth.clientId,
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