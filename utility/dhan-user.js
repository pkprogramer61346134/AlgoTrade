/**
 * Dhan User Profile, Ledger & EDIS T-PIN Module
 * Location: C:\AlgoTrade\utility\dhan-user.js
 */

const config = require("./token/config");

class DhanUser {
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

        try {
            const response = await fetch(url, fetchOptions);
            const data = await response.json();

            if (!response.ok) {
                return {
                    status: "error",
                    statusCode: response.status,
                    message: data.remarks?.error_message || data.message || "User API failed",
                    errorData: data
                };
            }
            return { status: "success", statusCode: response.status, data };
        } catch (error) {
            return { status: "error", message: error.message || "Network error" };
        }
    }

    /**
     * Get User Profile (GET /user/profile)
     */
    async getProfile() {
        return await this.request("/user/profile");
    }

    /**
     * Get Ledger Statement (GET /ledger)
     */
    async getLedger(fromDate, toDate) {
        return await this.request(`/ledger?fromDate=${fromDate}&toDate=${toDate}`);
    }

    /**
     * Generate EDIS T-PIN (GET /edis/tpin)
     */
    async generateEdisTpin() {
        return await this.request("/edis/tpin");
    }
}

module.exports = {
    DhanUser
};
