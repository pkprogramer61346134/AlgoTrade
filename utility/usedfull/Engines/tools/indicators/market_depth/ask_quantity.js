/**
 * Calculates Total Ask Quantity from Level-2 Order Book Depth
 * @param {Object} marketQuote - Dhan Market Quote object
 */
function getTotalAskQuantity(marketQuote) {
    if (!marketQuote) return 0;
    const asks = marketQuote.asks || marketQuote.sell || [];
    return asks.reduce((sum, a) => sum + (a.quantity || a.qty || 0), 0);
}

module.exports = { getTotalAskQuantity };
