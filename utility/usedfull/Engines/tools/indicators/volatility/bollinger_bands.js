const { calculateSMA } = require('../trend/sma');

/**
 * Calculates Bollinger Bands (Upper Band, Middle Band, Lower Band)
 * @param {Array} candles - Array of candles
 * @param {number} period - SMA period (default 20)
 * @param {number} stdDevMult - Standard Deviation Multiplier (default 2)
 */
function calculateBollingerBands(candles = [], period = 20, stdDevMult = 2) {
    if (!candles || candles.length < period) return [];

    const prices = candles.map(c => typeof c === 'object' ? c.close : c);
    const smaValues = calculateSMA(prices, period);
    const bands = new Array(candles.length).fill(null);

    for (let i = period - 1; i < prices.length; i++) {
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = smaValues[i];
        const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);

        bands[i] = {
            middle: mean,
            upper: mean + (stdDevMult * stdDev),
            lower: mean - (stdDevMult * stdDev),
            stdDev
        };
    }

    return bands;
}

module.exports = { calculateBollingerBands };
