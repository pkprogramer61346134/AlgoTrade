/**
 * Identifies key Support and Resistance levels from recent candle swings
 * @param {Array} candles - Array of candle objects
 * @param {number} lookback - Lookback window (default 50)
 */
function findSupportResistance(candles = [], lookback = 50) {
    if (!candles || candles.length === 0) return { supports: [], resistances: [] };

    const slice = candles.slice(-lookback);
    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);

    // Dynamic clustering of touch points
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);

    const resistances = [maxHigh];
    const supports = [minLow];

    // Find local peaks
    for (let i = 2; i < slice.length - 2; i++) {
        if (slice[i].high > slice[i - 1].high && slice[i].high > slice[i + 1].high) {
            resistances.push(slice[i].high);
        }
        if (slice[i].low < slice[i - 1].low && slice[i].low < slice[i + 1].low) {
            supports.push(slice[i].low);
        }
    }

    return {
        resistances: [...new Set(resistances.map(r => Number(r.toFixed(2))))].sort((a, b) => b - a),
        supports: [...new Set(supports.map(s => Number(s.toFixed(2))))].sort((a, b) => a - b)
    };
}

module.exports = { findSupportResistance };
