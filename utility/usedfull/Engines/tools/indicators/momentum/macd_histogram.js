const { calculateMACD } = require('./macd');

/**
 * Analyzes MACD Histogram value and momentum direction shifts
 * @param {Array} candles - Array of candles
 */
function analyzeMACDHistogram(candles = []) {
    const macdResults = calculateMACD(candles);
    if (!macdResults || macdResults.length < 2) return { momentum: "NEUTRAL", hist: 0 };

    const curr = macdResults[macdResults.length - 1];
    const prev = macdResults[macdResults.length - 2];

    if (!curr.histogram || !prev.histogram) return { momentum: "NEUTRAL", hist: 0 };

    let momentum = "NEUTRAL";
    if (curr.histogram > 0 && curr.histogram > prev.histogram) momentum = "STRONG_BULLISH";
    else if (curr.histogram > 0 && curr.histogram < prev.histogram) momentum = "WEAKENING_BULLISH";
    else if (curr.histogram < 0 && curr.histogram < prev.histogram) momentum = "STRONG_BEARISH";
    else if (curr.histogram < 0 && curr.histogram > prev.histogram) momentum = "WEAKENING_BEARISH";

    return { momentum, hist: Number(curr.histogram.toFixed(2)), isCrossOver: (prev.histogram <= 0 && curr.histogram > 0) };
}

module.exports = { analyzeMACDHistogram };
