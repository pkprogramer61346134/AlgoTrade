/**
 * Aggregates Top 5 Bids and Top 5 Asks from Order Book Level-2 Depth
 * @param {Object} marketQuote - Dhan Market Quote object
 */
function getTop5Depth(marketQuote) {
    if (!marketQuote) return { top5Bids: [], top5Asks: [] };

    const bids = (marketQuote.bids || marketQuote.buy || []).slice(0, 5);
    const asks = (marketQuote.asks || marketQuote.sell || []).slice(0, 5);

    return { top5Bids: bids, top5Asks: asks };
}

module.exports = { getTop5Depth };
