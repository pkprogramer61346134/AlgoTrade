const { calculateRSI } = require('./rsi');
const { calculateSMA } = require('../trend/sma');

/**
 * Calculates Stochastic RSI (%K and %D)
 * @param {Array} candles - Array of candles
 * @param {number} rsiPeriod - Period for RSI (default 14)
 * @param {number} stochPeriod - Period for Stochastic (default 14)
 * @param {number} kPeriod - Smoothing %K (default 3)
 * @param {number} dPeriod - Smoothing %D (default 3)
 */
function calculateStochasticRSI(candles = [], rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
    const rsiValues = calculateRSI(candles, rsiPeriod);
    const n = rsiValues.length;
    const stochRSI = new Array(n).fill(null);

    for (let i = rsiPeriod + stochPeriod - 1; i < n; i++) {
        const windowRSI = rsiValues.slice(i - stochPeriod + 1, i + 1).filter(v => v !== null);
        if (windowRSI.length === stochPeriod) {
            const minRSI = Math.min(...windowRSI);
            const maxRSI = Math.max(...windowRSI);
            const range = maxRSI - minRSI;
            stochRSI[i] = range === 0 ? 0 : ((rsiValues[i] - minRSI) / range) * 100;
        }
    }

    const percentK = calculateSMA(stochRSI.map(v => v === null ? 0 : v), kPeriod);
    const percentD = calculateSMA(percentK.map(v => v === null ? 0 : v), dPeriod);

    return candles.map((c, idx) => ({
        stochRSI: stochRSI[idx],
        k: percentK[idx],
        d: percentD[idx]
    }));
}

module.exports = { calculateStochasticRSI };
