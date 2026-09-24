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

    getHeaders() {
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "access-token": this.accessToken,
            "client-id": this.clientId
        };
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const fetchOptions = {
            method: options.method || "GET",
            headers: { ...this.getHeaders(), ...(options.headers || {}) }
        };

        if (options.body) {
            fetchOptions.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
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
