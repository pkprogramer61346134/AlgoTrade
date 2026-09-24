/**
 * Detects Breakouts above Resistance or below Support levels
 * @param {Array} candles - Array of candle objects
 * @param {number} level - Price level to check for breakout
 * @param {string} type - "RESISTANCE" or "SUPPORT"
 */
function detectBreakout(candles = [], level, type = "RESISTANCE") {
    if (!candles || candles.length === 0 || level === undefined) return null;

    const latest = candles[candles.length - 1];
    const prev = candles.length > 1 ? candles[candles.length - 2] : null;

    if (type === "RESISTANCE") {
        const isBreakout = latest.close > level && (prev ? prev.close <= level : true);
        const isVolumeConfirmed = latest.volume > (prev ? prev.volume * 1.2 : 0);
        return { isBreakout, level, type, isVolumeConfirmed, candle: latest };
    } else {
        const isBreakout = latest.close < level && (prev ? prev.close >= level : true);
        const isVolumeConfirmed = latest.volume > (prev ? prev.volume * 1.2 : 0);
        return { isBreakout, level, type, isVolumeConfirmed, candle: latest };
    }
}

module.exports = { detectBreakout };
