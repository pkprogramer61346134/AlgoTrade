/**
 * Dhan Portfolio, Holdings & Position Conversion Module
 * Location: C:\AlgoTrade\utility\dhan-portfolio.js
 */

const config = require("./token/config");

class DhanPortfolio {
    constructor(options = {}) {
        this.clientId = options.clientId || config.CLIENT_ID;
        this.accessToken = options.accessToken || config.ACCESS_TOKEN;
        this.baseUrl = options.baseUrl || config.BASE_URL;
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
            const data = await response.json();

            if (!response.ok) {
                return {
                    status: "error",
                    statusCode: response.status,
                    message: data.remarks?.error_message || data.message || "Portfolio API failed",
                    errorData: data
                };
            }
            return { status: "success", statusCode: response.status, data };
        } catch (error) {
            return { status: "error", message: error.message || "Network error" };
        }
    }

    /**
     * Get Holdings (GET /holdings)
     */
    async getHoldings() {
        return await this.request("/holdings");
    }

    /**
     * Get Positions (GET /positions)
     */
    async getPositions() {
        return await this.request("/positions");
    }

    /**
     * Convert Position (POST /positions/convert)
     */
    async convertPosition(params = {}) {
        return await this.request("/positions/convert", {
            method: "POST",
            body: {
                dhanClientId: this.clientId,
                fromProductType: params.fromProductType,
                toProductType: params.toProductType,
                exchangeSegment: params.exchangeSegment,
                positionType: params.positionType || "DIRECT",
                securityId: params.securityId,
                convertQty: params.convertQty
            }
        });
    }
}

module.exports = {
    DhanPortfolio
};
