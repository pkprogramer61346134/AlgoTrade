const { calculateEMA } = require('../trend/ema');
const { calculateATR } = require('./atr');

/**
 * Calculates Keltner Channels (Middle EMA, Upper Band, Lower Band)
 * @param {Array} candles - Array of candles
 * @param {number} period - EMA period (default 20)
 * @param {number} atrMultiplier - ATR multiplier (default 2)
 */
function calculateKeltnerChannels(candles = [], period = 20, atrMultiplier = 2) {
    if (!candles || candles.length < period) return [];

    const emaValues = calculateEMA(candles, period);
    const atrValues = calculateATR(candles, period);

    return candles.map((c, idx) => {
        const ema = emaValues[idx];
        const atr = atrValues[idx];

        if (ema === null || atr === null) return null;

        return {
            middle: ema,
            upper: ema + (atrMultiplier * atr),
            lower: ema - (atrMultiplier * atr)
        };
    });
}

module.exports = { calculateKeltnerChannels };
