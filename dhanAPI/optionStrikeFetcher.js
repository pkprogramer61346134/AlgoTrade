const { DhanSDK } = require('./index');

class DhanOptionStrikeFetcher {
    constructor() {
        this.dhan = new DhanSDK();
        this.ocCache = null;
        this.ocCacheTime = 0;
        this.cacheTTL = 2000; // 2 seconds cache to prevent rate-limiting while providing real-time updates
        this.nearestExpiry = null;
    }

    /**
     * Fetches nearest expiry and Option Chain matrix from Dhan API for NIFTY 50 (SecurityID 13, Segment IDX_I)
     */
    async fetchOptionChain(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && this.ocCache && (now - this.ocCacheTime < this.cacheTTL)) {
            return { ocMap: this.ocCache, expiry: this.nearestExpiry };
        }

        // 1. Get Option Chain Expiries list
        const expRes = await this.dhan.marketData.getOptionChainExpiries(13, 'IDX_I');
        if (expRes.status !== 'success' || !expRes.data) {
            const errorMsg = expRes.message || (expRes.errorData ? JSON.stringify(expRes.errorData) : 'Failed to fetch option expiries');
            throw new Error(`[DHAN OPTION ERROR] ${errorMsg}`);
        }

        const expList = expRes.data.data || expRes.data;
        if (!Array.isArray(expList) || expList.length === 0) {
            throw new Error('[DHAN OPTION ERROR] No option expiries available from Dhan API');
        }

        this.nearestExpiry = expList[0];

        // 2. Get Option Chain Matrix
        const ocRes = await this.dhan.marketData.getOptionChain(13, 'IDX_I', this.nearestExpiry);
        if (ocRes.status !== 'success' || !ocRes.data) {
            const errorMsg = ocRes.message || (ocRes.errorData ? JSON.stringify(ocRes.errorData) : 'Failed to fetch option chain');
            throw new Error(`[DHAN OPTION ERROR] ${errorMsg}`);
        }

        const ocMap = ocRes.data?.data?.oc || ocRes.data?.oc || ocRes.oc;
        if (!ocMap) {
            throw new Error('[DHAN OPTION ERROR] Invalid option chain matrix format received from Dhan API');
        }

        this.ocCache = ocMap;
        this.ocCacheTime = Date.now();
        return { ocMap, expiry: this.nearestExpiry };
    }

    /**
     * Resolves the exact ATM (At-The-Money) Strike Price, Security ID, and Real Live Dhan LTP for Nifty Spot Price.
     * Strictly matches live market ATM strike (nearest 50-point rounded strike to Nifty Spot).
     * NO cheap OTM budget fallbacks!
     */
    async resolveOptionStrike(spotPrice, optionType, maxBudget = null) {
        if (!spotPrice || spotPrice <= 0) {
            throw new Error(`[DHAN OPTION ERROR] Invalid Nifty Spot Price: ${spotPrice}`);
        }

        const optType = optionType.toUpperCase(); // 'CE' or 'PE'

        // Strictly calculate nearest ATM Strike (e.g. Spot 23419.1 -> 23400, Spot 23428 -> 23450)
        const chosenStrike = Math.round(spotPrice / 50) * 50;

        const { ocMap, expiry } = await this.fetchOptionChain();

        const targetKey = Object.keys(ocMap).find(k => Math.abs(parseFloat(k) - chosenStrike) < 0.1);

        if (!targetKey || !ocMap[targetKey]) {
            throw new Error(`[DHAN OPTION ERROR] Real Market ATM Strike ${chosenStrike} ${optType} not found in Dhan Option Chain matrix`);
        }

        const strikeObj = ocMap[targetKey];
        const sideObj = optType === 'CE' ? strikeObj.ce : strikeObj.pe;

        if (!sideObj || !sideObj.security_id) {
            throw new Error(`[DHAN OPTION ERROR] Contract details missing for ATM Strike ${chosenStrike} ${optType} in Dhan Option Chain`);
        }

        const liveLtp = Number(sideObj.last_price || sideObj.top_bid_price || sideObj.previous_close_price || 0);
        if (liveLtp <= 0) {
            throw new Error(`[DHAN OPTION ERROR] Received zero or invalid live price (₹${liveLtp}) for ATM Strike ${chosenStrike} ${optType} from Dhan API`);
        }

        const qty = 65; // 1 Lot Nifty = 65 Qty
        const requiredMargin = liveLtp * qty;

        // If maxBudget is specified and available balance cannot afford 1 Lot (65 Qty) of the real ATM strike:
        if (maxBudget && maxBudget > 0 && requiredMargin > maxBudget) {
            throw new Error(`[DHAN OPTION ERROR] Insufficient Funds for Real Market ATM Strike NIFTY_${chosenStrike}_${optType} @ ₹${liveLtp}. Required Margin for 1 Lot (65 Qty): ₹${requiredMargin.toFixed(2)}, Available Balance: ₹${maxBudget.toFixed(2)}. Please add funds.`);
        }

        return {
            securityId: sideObj.security_id,
            symbol: `NIFTY_${chosenStrike}_${optType}`,
            strikePrice: chosenStrike,
            optionType: optType,
            liveLtp,
            expiry,
            previousClose: Number(sideObj.previous_close_price || 0),
            bid: Number(sideObj.top_bid_price || 0),
            ask: Number(sideObj.top_ask_price || 0)
        };
    }

    /**
     * Refreshes the real live Dhan LTP for an active option contract
     */
    async fetchLiveOptionLtp(strikePrice, optionType, securityId = null) {
        const { ocMap } = await this.fetchOptionChain(false); // Uses 2s cache or refreshes
        const optType = optionType.toUpperCase();
        const targetKey = Object.keys(ocMap).find(k => Math.abs(parseFloat(k) - strikePrice) < 0.1);

        if (!targetKey) {
            throw new Error(`[DHAN OPTION ERROR] Active strike ${strikePrice} not found during LTP update`);
        }

        const sideObj = optType === 'CE' ? ocMap[targetKey].ce : ocMap[targetKey].pe;
        if (!sideObj) {
            throw new Error(`[DHAN OPTION ERROR] Contract data missing for ${strikePrice} ${optType} during LTP update`);
        }

        const liveLtp = Number(sideObj.last_price || sideObj.top_bid_price || 0);
        if (liveLtp <= 0) {
            throw new Error(`[DHAN OPTION ERROR] Live price unavailable for ${strikePrice} ${optType}`);
        }

        return liveLtp;
    }
}

module.exports = DhanOptionStrikeFetcher;
