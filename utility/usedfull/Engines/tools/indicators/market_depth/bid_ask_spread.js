const { getBestBidPrice } = require('./best_bid');
const { getBestAskPrice } = require('./best_ask');

/**
 * Calculates Bid-Ask Spread and Spread %
 * @param {Object} marketQuote - Dhan Market Quote object
 */
function calculateBidAskSpread(marketQuote) {
    const bid = getBestBidPrice(marketQuote);
    const ask = getBestAskPrice(marketQuote);

    if (!bid || !ask || ask <= bid) return { spread: 0, spreadPercent: 0 };

    const spread = ask - bid;
    const spreadPercent = (spread / ask) * 100;

    return {
        bid,
        ask,
        spread: Number(spread.toFixed(2)),
        spreadPercent: Number(spreadPercent.toFixed(4))
    };
}

module.exports = { calculateBidAskSpread };
