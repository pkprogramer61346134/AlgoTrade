const DhanOptionStrikeFetcher = require('../dhanAPI/optionStrikeFetcher');
const { DhanSDK } = require('../dhanAPI');

/**
 * SELECT STRIKE PRICE BASED ON BALANCE
 * 
 * Module responsible for:
 * 1. Fetching real Dhan account available balance for Real Trading.
 * 2. Selecting Paper Trading strike price using Virtual Balance (e.g. ₹10,000).
 * 3. Scanning Dhan Option Chain for ANY strike price (CE/PE) whose required margin fits within target balance.
 */
class SelectStrikePriceBasedOnBalance {
    constructor() {
        this.strikeFetcher = new DhanOptionStrikeFetcher();
        this.dhan = new DhanSDK();
    }

    /**
     * Fetches real account available balance directly from Dhan API.
     */
    async fetchRealBalance() {
        try {
            if (this.dhan && typeof this.dhan.funds?.getFundLimits === 'function') {
                const fundRes = await this.dhan.funds.getFundLimits();
                if (fundRes && fundRes.status === 'success' && fundRes.data) {
                    const realBal = Number(fundRes.data.availabelBalance || fundRes.data.availableBalance || 0);
                    if (realBal > 0) {
                        console.log(`💰 [STRIKE SELECTOR] Real Dhan Account Balance Fetched: ₹${realBal}`);
                        return realBal;
                    }
                }
            }
        } catch (e) {
            console.warn(`⚠️ [STRIKE SELECTOR] Fund fetch warning: ${e.message}`);
        }
        return 0;
    }

    /**
     * Dedicated method for Paper Trading: Selects strike price strictly based on Virtual Balance (e.g. ₹10,000).
     * 
     * @param {number} spotPrice - Current Nifty 50 spot price (e.g. 23200)
     * @param {string} optionType - 'CE' or 'PE'
     * @param {number} [virtualBalance=10000.0] - Virtual capital allocated for paper trading
     * @returns {Promise<Object>} Selected strike details
     */
    async selectStrikeForPaperTrading(spotPrice, optionType, virtualBalance = 10000.0) {
        console.log(`📝 [PAPER STRIKE SELECTOR] Resolving ${optionType} strike using Virtual Balance ₹${virtualBalance}...`);
        return this.selectStrike(spotPrice, optionType, virtualBalance);
    }

    /**
     * Dedicated method for Real Trading: Selects strike price strictly based on Real Dhan Account Balance.
     * 
     * @param {number} spotPrice - Current Nifty 50 spot price (e.g. 23200)
     * @param {string} optionType - 'CE' or 'PE'
     * @returns {Promise<Object>} Selected strike details
     */
    async selectStrikeForRealMoney(spotPrice, optionType) {
        const realBal = await this.fetchRealBalance();
        if (!realBal || realBal <= 0) {
            throw new Error(`[REAL STRIKE SELECTION ERROR] Real Dhan account balance is 0 or unavailable.`);
        }
        return this.selectStrike(spotPrice, optionType, realBal);
    }

    /**
     * Core method: Selects option strike price strictly based on active balance.
     * Finds the closest available strike to spot price whose required margin fits within active balance.
     * 
     * @param {number} spotPrice - Current Nifty 50 spot price (e.g. 23200)
     * @param {string} optionType - 'CE' or 'PE'
     * @param {number} [customBalance] - Optional balance override (Virtual or Real)
     * @returns {Promise<Object>} Selected strike details
     */
    async selectStrike(spotPrice, optionType, customBalance = null) {
        if (!spotPrice || spotPrice <= 0) {
            throw new Error(`[STRIKE SELECTION ERROR] Invalid Nifty Spot Price: ${spotPrice}`);
        }

        // Determine active balance: Use customBalance (if provided), otherwise fetch real Dhan balance
        let activeBalance = 0;
        if (customBalance !== null && customBalance > 0) {
            activeBalance = customBalance;
        } else {
            activeBalance = await this.fetchRealBalance();
        }

        if (!activeBalance || activeBalance <= 0) {
            throw new Error(`[STRIKE SELECTION ERROR] Could not fetch real Dhan account balance and no custom balance provided.`);
        }

        const optType = (optionType || 'CE').toUpperCase();
        const qty = 65; // 1 Lot Nifty = 65 Qty
        console.log(`🔍 [STRIKE SELECTOR] Searching ${optType} strike for Spot ₹${spotPrice} matching Balance ₹${activeBalance}...`);

        // Fetch Option Chain matrix from Dhan API
        const { ocMap, expiry } = await this.strikeFetcher.fetchOptionChain();

        const allStrikes = Object.keys(ocMap)
            .map(k => {
                const strike = parseFloat(k);
                const sObj = ocMap[k];
                const side = optType === 'CE' ? sObj.ce : sObj.pe;
                if (!side || !side.security_id) return null;
                const ltp = Number(side.last_price || side.top_bid_price || side.previous_close_price || 0);
                if (ltp <= 0) return null;
                const margin = ltp * qty;
                return {
                    strikeKey: k,
                    strike,
                    side,
                    ltp,
                    margin,
                    securityId: side.security_id,
                    distance: Math.abs(strike - spotPrice)
                };
            })
            .filter(item => item !== null);

        if (allStrikes.length === 0) {
            throw new Error(`[STRIKE SELECTION ERROR] No valid option contracts found in Dhan Option Chain`);
        }

        // Find strikes that fit within activeBalance
        const affordableStrikes = allStrikes.filter(item => item.margin <= activeBalance);

        let chosenItem = null;

        if (affordableStrikes.length > 0) {
            // Sort affordable strikes by distance to spot price (closest first)
            affordableStrikes.sort((a, b) => a.distance - b.distance);
            chosenItem = affordableStrikes[0];
        } else {
            // If no strike fits activeBalance, pick the cheapest strike available in option chain
            allStrikes.sort((a, b) => a.margin - b.margin);
            chosenItem = allStrikes[0];
            console.warn(`⚠️ [STRIKE SELECTOR] Balance ₹${activeBalance} is lower than cheapest strike margin ₹${chosenItem.margin.toFixed(2)}. Selecting cheapest strike.`);
        }

        const symbol = `NIFTY_${chosenItem.strike}_${optType}`;
        const selectionResult = {
            symbol,
            strikePrice: chosenItem.strike,
            optionType: optType,
            liveLtp: Number(chosenItem.ltp.toFixed(2)),
            securityId: chosenItem.securityId,
            qty,
            requiredMargin: Number(chosenItem.margin.toFixed(2)),
            balanceUsed: activeBalance,
            expiry: expiry || 'CURRENT'
        };

        console.log(`✅ [STRIKE SELECTED] ${selectionResult.symbol} | Strike: ₹${selectionResult.strikePrice} | LTP: ₹${selectionResult.liveLtp} | Required Margin: ₹${selectionResult.requiredMargin} | Balance: ₹${selectionResult.balanceUsed}`);
        return selectionResult;
    }

    /**
     * Alias method for backward/cross module compatibility
     */
    async resolveStrikePrice(spotPrice, optionType, customBalance = null) {
        return this.selectStrike(spotPrice, optionType, customBalance);
    }

    /**
     * Alias method for fetching real Dhan balance
     */
    async fetchRealDhanBalance() {
        return this.fetchRealBalance();
    }
}

module.exports = SelectStrikePriceBasedOnBalance;
