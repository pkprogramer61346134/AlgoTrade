const { calculateBidAskSpread } = require('./bid_ask_spread');
const { getTotalBidQuantity } = require('./bid_quantity');
const { getTotalAskQuantity } = require('./ask_quantity');

/**
 * Calculates Liquidity Score (0 to 100) based on spread and total depth quantity
 * @param {Object} marketQuote - Dhan Market Quote object
 */
function calculateLiquidityScore(marketQuote) {
    const spreadInfo = calculateBidAskSpread(marketQuote);
    const totalQty = getTotalBidQuantity(marketQuote) + getTotalAskQuantity(marketQuote);

    // Tight spread + high quantity = High Liquidity Score
    let score = 100;
    if (spreadInfo.spreadPercent > 0.05) score -= 20;
    if (spreadInfo.spreadPercent > 0.1) score -= 30;
    if (totalQty < 1000) score -= 30;

    return {
        liquidityScore: Math.max(0, score),
        isLiquid: score >= 60
    };
}

module.exports = { calculateLiquidityScore };
