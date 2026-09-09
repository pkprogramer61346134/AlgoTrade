const { calculateEMA } = require('../trend/ema');

/**
 * Calculates MACD Line, Signal Line, and MACD Histogram
 * @param {Array} candles - Array of candles
 * @param {number} fastPeriod - Fast EMA period (default 12)
 * @param {number} slowPeriod - Slow EMA period (default 26)
 * @param {number} signalPeriod - Signal EMA period (default 9)
 */
function calculateMACD(candles = [], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!candles || candles.length < slowPeriod + signalPeriod) return [];

    const fastEMA = calculateEMA(candles, fastPeriod);
    const slowEMA = calculateEMA(candles, slowPeriod);

    const macdLine = [];
    const n = candles.length;

    for (let i = 0; i < n; i++) {
        if (fastEMA[i] !== null && slowEMA[i] !== null) {
            macdLine.push(fastEMA[i] - slowEMA[i]);
        } else {
            macdLine.push(null);
        }
    }

    // Signal Line is EMA of MACD Line
    const validMacd = macdLine.filter(val => val !== null);
    const signalEMA = calculateEMA(validMacd, signalPeriod);

    const signalLine = new Array(n).fill(null);
    const histogram = new Array(n).fill(null);

    let validIdx = 0;
    for (let i = 0; i < n; i++) {
        if (macdLine[i] !== null) {
            const sigVal = signalEMA[validIdx];
            if (sigVal !== undefined) {
                signalLine[i] = sigVal;
                histogram[i] = macdLine[i] - sigVal;
            }
            validIdx++;
        }
    }

    return candles.map((c, idx) => ({
        macd: macdLine[idx],
        signal: signalLine[idx],
        histogram: histogram[idx]
    }));
}

module.exports = { calculateMACD };
