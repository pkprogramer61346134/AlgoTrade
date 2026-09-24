/**
 * Extracts Best Bid Price from Level-2 Market Depth
 * @param {Object} marketQuote - Dhan Market Quote object
 */
function getBestBidPrice(marketQuote) {
    if (!marketQuote) return null;
    const depth = marketQuote.depth || marketQuote.buy || [];
    if (depth.length > 0) {
        return depth[0].price || depth[0].bidPrice || null;
    }
    return marketQuote.top_bid_price || null;
}

module.exports = { getBestBidPrice };
