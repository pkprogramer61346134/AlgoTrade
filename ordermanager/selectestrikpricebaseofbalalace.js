const DhanOptionStrikeFetcher = require('../dhanAPI/optionStrikeFetcher');

/**
 * SELECT STRIKE PRICE BASED ON BALANCE
 * 
 * Module responsible solely for selecting the optimal Option Strike Price
 * (ATM/ITM) from real Dhan API Option Chain based on available account balance.
 */
class SelectStrikePriceBasedOnBalance {
    constructor() {
        this.strikeFetcher = new DhanOptionStrikeFetcher();
    }

    /**
     * Selects option strike price based on Nifty spot price, option type ('CE'/'PE'), and available balance.
     * 
     * @param {number} spotPrice - Current Nifty 50 spot price (e.g. 23200)
     * @param {string} optionType - 'CE' or 'PE'
     * @param {number} availableBalance - Available account funds in INR
     * @returns {Promise<Object>} Selected strike details: { symbol, strikePrice, optionType, liveLtp, securityId, requiredMargin, qty }
     */
    async selectStrike(spotPrice, optionType, availableBalance) {
        if (!spotPrice || spotPrice <= 0) {
            throw new Error(`[STRIKE SELECTION ERROR] Invalid Nifty Spot Price: ${spotPrice}`);
        }

        if (!availableBalance || availableBalance <= 0) {
            throw new Error(`[STRIKE SELECTION ERROR] Insufficient balance available: ₹${availableBalance}`);
        }

        const optType = (optionType || 'CE').toUpperCase();
        console.log(`🔍 [STRIKE SELECTOR] Resolving ${optType} strike for Spot ₹${spotPrice} with Balance ₹${availableBalance}...`);

        // Resolve optimal strike price using real Dhan Option Chain
        const optionDetails = await this.strikeFetcher.resolveOptionStrike(spotPrice, optType, availableBalance);

        const qty = 65; // 1 Lot Nifty = 65 Qty
        const liveLtp = Number(optionDetails.liveLtp.toFixed(2));
        const requiredMargin = liveLtp * qty;

        if (availableBalance < requiredMargin) {
            throw new Error(`[STRIKE SELECTION ERROR] Required margin ₹${requiredMargin} exceeds available balance ₹${availableBalance}`);
        }

        const selectionResult = {
            symbol: optionDetails.symbol,
            strikePrice: optionDetails.strikePrice,
            optionType: optType,
            liveLtp,
            securityId: optionDetails.securityId,
            qty,
            requiredMargin,
            expiry: optionDetails.expiry || 'CURRENT'
        };

        console.log(`✅ [STRIKE SELECTED] ${selectionResult.symbol} | Strike: ₹${selectionResult.strikePrice} | LTP: ₹${selectionResult.liveLtp} | Required Margin: ₹${selectionResult.requiredMargin}`);
        return selectionResult;
    }
}

module.exports = SelectStrikePriceBasedOnBalance;
