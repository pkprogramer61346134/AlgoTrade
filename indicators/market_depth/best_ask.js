/**
 * Extracts Best Ask Price from Level-2 Market Depth
 * @param {Object} marketQuote - Dhan Market Quote object
 */
function getBestAskPrice(marketQuote) {
    if (!marketQuote) return null;
    const depth = marketQuote.depth || marketQuote.sell || [];
    if (depth.length > 0) {
        return depth[0].price || depth[0].askPrice || null;
    }
    return marketQuote.top_ask_price || null;
}

module.exports = { getBestAskPrice };
