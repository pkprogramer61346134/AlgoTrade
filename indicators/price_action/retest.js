/**
 * Detects Level Retest after a breakout
 * @param {Array} candles - Array of candle objects
 * @param {number} level - Broken key level
 * @param {string} originalType - "RESISTANCE" (now acting as Support) or "SUPPORT" (now acting as Resistance)
 * @param {number} tolerancePercent - Percent tolerance for retest (default 0.2%)
 */
function detectRetest(candles = [], level, originalType = "RESISTANCE", tolerancePercent = 0.2) {
    if (!candles || candles.length === 0 || level === undefined) return { isRetesting: false };

    const latest = candles[candles.length - 1];
    const tolerance = level * (tolerancePercent / 100);

    if (originalType === "RESISTANCE") {
        // Resistance broken up -> Retesting broken level from above as support
        const touchesLevel = latest.low <= (level + tolerance) && latest.low >= (level - tolerance);
        const bouncesUp = latest.close > level;
        return { isRetesting: touchesLevel && bouncesUp, level, status: "BULLISH_RETEST" };
    } else {
        // Support broken down -> Retesting broken level from below as resistance
        const touchesLevel = latest.high >= (level - tolerance) && latest.high <= (level + tolerance);
        const rejectsDown = latest.close < level;
        return { isRetesting: touchesLevel && rejectsDown, level, status: "BEARISH_RETEST" };
    }
}

module.exports = { detectRetest };
