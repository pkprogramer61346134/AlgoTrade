const { getTotalBidQuantity } = require('./bid_quantity');
const { getTotalAskQuantity } = require('./ask_quantity');

/**
 * Calculates Market Order Book Depth Imbalance Ratio (Buying Pressure vs Selling Pressure)
 * @param {Object} marketQuote - Dhan Market Quote object
 */
function calculateDepthImbalance(marketQuote) {
    const totalBids = getTotalBidQuantity(marketQuote);
    const totalAsks = getTotalAskQuantity(marketQuote);

    const sum = totalBids + totalAsks;
    if (sum === 0) return { imbalanceRatio: 0, bias: "BALANCED" };

    const buyingPressure = (totalBids / sum) * 100;
    let bias = "BALANCED";

    if (buyingPressure > 60) bias = "BULLISH_PRESSURE";
    else if (buyingPressure < 40) bias = "BEARISH_PRESSURE";

    return {
        buyingPressure: Number(buyingPressure.toFixed(2)),
        sellingPressure: Number((100 - buyingPressure).toFixed(2)),
        bias
    };
}

module.exports = { calculateDepthImbalance };
