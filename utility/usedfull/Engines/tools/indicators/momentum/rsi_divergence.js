const { calculateRSI } = require('./rsi');

/**
 * Detects Bullish and Bearish RSI Divergence
 * @param {Array} candles - Array of candle objects
 * @param {number} period - RSI period (default 14)
 * @param {number} lookback - Swing lookback
 */
function detectRSIDivergence(candles = [], period = 14, lookback = 20) {
    if (!candles || candles.length < period + lookback) return { isDivergence: false, type: "NONE" };

    const rsiValues = calculateRSI(candles, period);
    const sliceCandles = candles.slice(-lookback);
    const sliceRSI = rsiValues.slice(-lookback);

    const priceMinIdx = sliceCandles.reduce((minI, c, i, arr) => c.low < arr[minI].low ? i : minI, 0);
    const priceMaxIdx = sliceCandles.reduce((maxI, c, i, arr) => c.high > arr[maxI].high ? i : maxI, 0);

    const currPrice = sliceCandles[sliceCandles.length - 1].close;
    const currRSI = sliceRSI[sliceRSI.length - 1];

    // Regular Bullish Divergence: Price making Lower Low, RSI making Higher Low
    if (currPrice < sliceCandles[priceMinIdx].close && currRSI > sliceRSI[priceMinIdx]) {
        return { isDivergence: true, type: "BULLISH_DIVERGENCE", currRSI, priceMin: sliceCandles[priceMinIdx].close };
    }

    // Regular Bearish Divergence: Price making Higher High, RSI making Lower High
    if (currPrice > sliceCandles[priceMaxIdx].close && currRSI < sliceRSI[priceMaxIdx]) {
        return { isDivergence: true, type: "BEARISH_DIVERGENCE", currRSI, priceMax: sliceCandles[priceMaxIdx].close };
    }

    return { isDivergence: false, type: "NONE", currRSI };
}

module.exports = { detectRSIDivergence };
