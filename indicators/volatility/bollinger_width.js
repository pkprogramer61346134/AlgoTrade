const { calculateBollingerBands } = require('./bollinger_bands');

/**
 * Calculates Bollinger Bandwidth and Squeeze Detection
 * @param {Array} candles - Array of candles
 * @param {number} period - Period (default 20)
 */
function calculateBollingerWidth(candles = [], period = 20) {
    const bands = calculateBollingerBands(candles, period);
    if (!bands || bands.length === 0) return [];

    return bands.map(b => {
        if (!b) return null;
        const width = b.middle > 0 ? ((b.upper - b.lower) / b.middle) * 100 : 0;
        return {
            bandwidth: Number(width.toFixed(2)),
            isSqueeze: width < 3.0 // Width < 3% indicates tight volatility squeeze
        };
    });
}

module.exports = { calculateBollingerWidth };
