const { calculateEMA } = require('../trend/ema');

/**
 * Calculates Moving Average of Volume
 * @param {Array} candles - Array of candles
 * @param {number} period - Volume EMA period (default 20)
 */
function calculateVolumeEMA(candles = [], period = 20) {
    if (!candles || candles.length === 0) return [];
    const volumes = candles.map(c => c.volume || 0);
    return calculateEMA(volumes, period);
}

module.exports = { calculateVolumeEMA };
