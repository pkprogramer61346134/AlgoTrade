/**
 * Dhan Funds & Margin Calculator Module
 * Location: C:\AlgoTrade\utility\dhan-funds.js
 */

const config = require("./token/config");

class DhanFunds {
    constructor(options = {}) {
        this.clientId = options.clientId || config.CLIENT_ID;
        this.accessToken = options.accessToken || config.ACCESS_TOKEN;
        this.baseUrl = options.baseUrl || config.BASE_URL;
    }

    /**
     * Get Fund Limits (GET /fundlimit)
     */
    async getFundLimits() {
        try {
            const response = await fetch(`${this.baseUrl}/fundlimit`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "access-token": this.accessToken,
                    "client-id": this.clientId
                }
            });

            const data = await response.json();
            if (!response.ok) {
                return {
                    status: "error",
                    statusCode: response.status,
                    message: data.remarks?.error_message || data.message || "Failed to fetch fund limits",
                    errorData: data
                };
            }
            return { status: "success", statusCode: response.status, data };
        } catch (error) {
            return { status: "error", message: error.message || "Network error" };
        }
    }

    /**
     * Calculate Margin (POST /margincalculator)
     */
    async calculateMargin(params = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/margincalculator`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "access-token": this.accessToken,
                    "client-id": this.clientId
                },
                body: JSON.stringify({
                    dhanClientId: this.clientId,
                    exchangeSegment: params.exchangeSegment,
                    transactionType: params.transactionType,
                    quantity: params.quantity,
                    productType: params.productType,
                    securityId: params.securityId,
                    price: params.price || 0,
                    triggerPrice: params.triggerPrice || 0
                })
            });

            const data = await response.json();
            if (!response.ok) {
                return {
                    status: "error",
                    statusCode: response.status,
                    message: data.remarks?.error_message || data.message || "Failed to calculate margin",
                    errorData: data
                };
            }
            return { status: "success", statusCode: response.status, data };
        } catch (error) {
            return { status: "error", message: error.message || "Network error" };
        }
    }
}

module.exports = {
    DhanFunds
};
