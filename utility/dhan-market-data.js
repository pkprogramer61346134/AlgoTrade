/**
 * Dhan Market Data & Option Chain Module
 * Location: C:\AlgoTrade\utility\dhan-market-data.js
 */

const config = require("./token/config");

class DhanMarketData {
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
            fetchOptions.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, fetchOptions);
            let data;
            const rawText = await response.text();
            try {
                data = JSON.parse(rawText);
            } catch (e) {
                data = rawText;
            }

            if (!response.ok) {
                return {
                    status: "error",
                    statusCode: response.status,
                    message: (typeof data === "object" && (data.remarks?.error_message || data.message)) || "Market Data API failed",
                    errorData: data
                };
            }
            return { status: "success", statusCode: response.status, data };
        } catch (error) {
            return { status: "error", message: error.message || "Network error" };
        }
    }

    /**
     * Get Option Chain Expiries list (POST /optionchain/expirylist)
     */
    async getOptionChainExpiries(underlyingSecurityId = 13, underlyingExchangeSegment = "IDX_I") {
        return await this.request("/optionchain/expirylist", {
            method: "POST",
            body: {
                UnderlyingScrip: Number(underlyingSecurityId),
                UnderlyingSeg: underlyingExchangeSegment
            }
        });
    }

    /**
     * Get Nearest / Current Expiry Date string directly
     */
    async getCurrentExpiry(underlyingSecurityId = 13, underlyingExchangeSegment = "IDX_I") {
        const expRes = await this.getOptionChainExpiries(underlyingSecurityId, underlyingExchangeSegment);
        if (expRes.status === "success" && Array.isArray(expRes.data?.data) && expRes.data.data.length > 0) {
            return expRes.data.data[0];
        }
        return null;
    }

    /**
     * Get Option Chain Matrix (POST /optionchain)
     */
    async getOptionChain(underlyingSecurityId = 13, underlyingExchangeSegment = "IDX_I", expiry = null) {
        let targetExpiry = expiry;
        if (!targetExpiry) {
            targetExpiry = await this.getCurrentExpiry(underlyingSecurityId, underlyingExchangeSegment);
        }

        if (!targetExpiry) {
            return { status: "error", message: "Failed to resolve expiry date" };
        }

        return await this.request("/optionchain", {
            method: "POST",
            body: {
                UnderlyingScrip: Number(underlyingSecurityId),
                UnderlyingSeg: underlyingExchangeSegment,
                Expiry: targetExpiry
            }
        });
    }

    /**
     * Helper Method: Fetches Current Expiry, Spot Price & Near-ATM Strike Prices (10 strikes below & 10 strikes above ATM) with CE/PE rates in one call!
     * 
     * @param {number} [underlyingSecurityId=13] - Dhan Scrip Code (Default: 13 for Nifty 50)
     * @param {string} [underlyingExchangeSegment="IDX_I"] - Segment
     * @param {number} [countBelow=10] - Number of strike prices below ATM
     * @param {number} [countAbove=10] - Number of strike prices above ATM
     */
    async getNearAtmOptionChain(underlyingSecurityId = 13, underlyingExchangeSegment = "IDX_I", countBelow = 10, countAbove = 10) {
        const currentExpiry = await this.getCurrentExpiry(underlyingSecurityId, underlyingExchangeSegment);
        if (!currentExpiry) {
            return { status: "error", message: "Could not fetch current expiry date" };
        }

        const ocRes = await this.getOptionChain(underlyingSecurityId, underlyingExchangeSegment, currentExpiry);
        if (ocRes.status !== "success" || !ocRes.data?.data) {
            return { status: "error", message: ocRes.message || "Failed to fetch option chain" };
        }

        const spotPrice = Number(ocRes.data.data.last_price || 0);
        const ocMap = ocRes.data.data.oc || {};
        
        const sortedStrikes = Object.keys(ocMap)
            .map(k => ({ key: k, strike: parseFloat(k) }))
            .filter(item => !isNaN(item.strike))
            .sort((a, b) => a.strike - b.strike);

        // Find ATM strike closest to spotPrice
        let atmIndex = 0;
        let minDiff = Infinity;
        sortedStrikes.forEach((item, idx) => {
            const diff = Math.abs(item.strike - spotPrice);
            if (diff < minDiff) {
                minDiff = diff;
                atmIndex = idx;
            }
        });

        // Take 10 strikes below ATM and 10 strikes above ATM
        const startIndex = Math.max(0, atmIndex - countBelow);
        const endIndex = Math.min(sortedStrikes.length - 1, atmIndex + countAbove);
        const selectedStrikes = sortedStrikes.slice(startIndex, endIndex + 1);

        const strikes = selectedStrikes.map(({ key, strike }) => {
            const ceData = ocMap[key]?.ce || {};
            const peData = ocMap[key]?.pe || {};

            return {
                strike,
                isAtm: Math.abs(strike - spotPrice) === minDiff,
                ce: {
                    securityId: ceData.security_id || null,
                    ltp: Number(ceData.last_price || 0),
                    bid: Number(ceData.top_bid_price || 0),
                    ask: Number(ceData.top_ask_price || 0),
                    delta: Number(ceData.greeks?.delta || 0)
                },
                pe: {
                    securityId: peData.security_id || null,
                    ltp: Number(peData.last_price || 0),
                    bid: Number(peData.top_bid_price || 0),
                    ask: Number(peData.top_ask_price || 0),
                    delta: Number(peData.greeks?.delta || 0)
                }
            };
        });

        return {
            status: "success",
            currentExpiry,
            spotPrice,
            atmStrike: sortedStrikes[atmIndex]?.strike || null,
            strikesCount: strikes.length,
            strikes
        };
    }

    /**
     * Get Rolling Option Historical Data (POST /charts/rollingoption)
     */
    async getRollingOptionData(params = {}) {
        return await this.request("/charts/rollingoption", {
            method: "POST",
            body: params
        });
    }

    /**
     * Get Snapshot Quotes (POST /marketfeed/quote)
     */
    async getMarketQuote(requestPayload = {}) {
        let body = requestPayload;
        if (Array.isArray(requestPayload)) {
            body = {};
            requestPayload.forEach(item => {
                const seg = item.exchangeSegment || item.ExchangeSegment || "IDX_I";
                const secId = Number(item.securityId || item.SecurityId);
                if (!body[seg]) body[seg] = [];
                if (!body[seg].includes(secId)) body[seg].push(secId);
            });
        }
        return await this.request("/marketfeed/quote", {
            method: "POST",
            body
        });
    }

    /**
     * Get Market Status (GET /marketfeed/market-status)
     */
    async getMarketStatus() {
        return await this.request("/marketfeed/market-status", { method: "GET" });
    }
}

module.exports = {
    DhanMarketData
};
