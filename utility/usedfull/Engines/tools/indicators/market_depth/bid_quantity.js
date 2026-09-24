/**
 * Calculates Total Bid Quantity from Level-2 Order Book Depth
 * @param {Object} marketQuote - Dhan Market Quote object
 */
function getTotalBidQuantity(marketQuote) {
    if (!marketQuote) return 0;
    const bids = marketQuote.bids || marketQuote.buy || [];
    return bids.reduce((sum, b) => sum + (b.quantity || b.qty || 0), 0);
}

module.exports = { getTotalBidQuantity };
