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
     * Resolves the Strike Price, Security ID, and Real Live Dhan LTP for Nifty Spot Price.
     * 1. Priority 1: Exact ATM Strike (nearest 50-multiple to Spot Price).
     * 2. If maxBudget is provided and ATM strike exceeds balance:
     *    Searches strikes sorted strictly by PROXIMITY to Spot Price (closest to ATM first)
     *    and picks the absolute closest strike that fits within maxBudget.
     * 3. Always executes trade without throwing Insufficient Funds errors!
     */
    async resolveOptionStrike(spotPrice, optionType, maxBudget = null) {
        if (!spotPrice || spotPrice <= 0) {
            throw new Error(`[DHAN OPTION ERROR] Invalid Nifty Spot Price: ${spotPrice}`);
        }

        const optType = optionType.toUpperCase(); // 'CE' or 'PE'
        const exactAtmStrike = Math.round(spotPrice / 50) * 50;
        const qty = 65; // 1 Lot Nifty = 65 Qty

        const { ocMap, expiry } = await this.fetchOptionChain();

        // 1. Check exact ATM strike first
        let targetKey = Object.keys(ocMap).find(k => Math.abs(parseFloat(k) - exactAtmStrike) < 0.1);
        let chosenStrike = exactAtmStrike;
        let chosenSideObj = null;

        if (targetKey && ocMap[targetKey]) {
            const side = optType === 'CE' ? ocMap[targetKey].ce : ocMap[targetKey].pe;
            if (side && side.security_id) {
                const ltp = Number(side.last_price || side.top_bid_price || side.previous_close_price || 0);
                if (ltp > 0 && (!maxBudget || maxBudget <= 0 || (ltp * qty) <= maxBudget)) {
                    chosenSideObj = side;
                }
            }
        }

        // 2. If ATM strike exceeds maxBudget or is missing, search strikes sorted by closeness to spotPrice
        if (!chosenSideObj) {
            const sortedStrikes = Object.keys(ocMap)
                .map(k => ({ key: k, strike: parseFloat(k) }))
                .filter(item => !isNaN(item.strike))
                .sort((a, b) => Math.abs(a.strike - spotPrice) - Math.abs(b.strike - spotPrice)); // Closest to ATM first!

            let bestFallback = null;

            for (const item of sortedStrikes) {
                const sObj = ocMap[item.key];
                if (!sObj) continue;
                const side = optType === 'CE' ? sObj.ce : sObj.pe;
                if (!side || !side.security_id) continue;
                const ltp = Number(side.last_price || side.top_bid_price || side.previous_close_price || 0);

                if (ltp <= 0) continue;

                if (!bestFallback) bestFallback = { item, side, ltp };

                if (maxBudget && maxBudget > 0 && (ltp * qty) <= maxBudget) {
                    targetKey = item.key;
                    chosenStrike = item.strike;
                    chosenSideObj = side;
                    console.log(`💡 [DHAN STRIKE FETCHER] Selected closest budget-friendly strike ${chosenStrike} ${optType} @ ₹${ltp} (Margin ₹${(ltp * qty).toFixed(2)} <= Available ₹${maxBudget})`);
                    break;
                }
            }

            // If balance is too low for any strike, use the absolute closest strike with valid price
            if (!chosenSideObj && bestFallback) {
                targetKey = bestFallback.item.key;
                chosenStrike = bestFallback.item.strike;
                chosenSideObj = bestFallback.side;
                console.log(`⚠️ [DHAN STRIKE FETCHER] Account balance ₹${maxBudget} active; sending order for closest strike ${chosenStrike} ${optType} @ ₹${bestFallback.ltp}`);
            }
        }

        if (!chosenSideObj || !chosenSideObj.security_id) {
            throw new Error(`[DHAN OPTION ERROR] Could not resolve any valid contract for ${optType} in Dhan Option Chain`);
        }

        const liveLtp = Number(chosenSideObj.last_price || chosenSideObj.top_bid_price || chosenSideObj.previous_close_price || 0);

        return {
            securityId: chosenSideObj.security_id,
            symbol: `NIFTY_${chosenStrike}_${optType}`,
            strikePrice: chosenStrike,
            optionType: optType,
            liveLtp,
            expiry,
            previousClose: Number(chosenSideObj.previous_close_price || 0),
            bid: Number(chosenSideObj.top_bid_price || 0),
            ask: Number(chosenSideObj.top_ask_price || 0)
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
