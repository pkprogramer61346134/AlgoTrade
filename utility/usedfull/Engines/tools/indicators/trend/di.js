const { calculateADX } = require('./adx');

/**
 * Calculates +DI and -DI directional movement values
 * @param {Array} candles - Array of candles
 * @param {number} period - Period (default 14)
 */
function calculateDirectionalIndicators(candles = [], period = 14) {
    const result = calculateADX(candles, period);
    return result.map(r => ({
        plusDI: r.plusDI,
        minusDI: r.minusDI,
        trendBias: (r.plusDI > r.minusDI) ? 'BULLISH' : 'BEARISH'
    }));
}

module.exports = { calculateDirectionalIndicators };
