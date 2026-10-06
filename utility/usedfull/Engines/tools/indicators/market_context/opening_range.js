/**
 * Calculates Opening Range Breakout (ORB) High and Low
 * @param {Array} candles - Array of intraday candles starting from market open
 * @param {number} durationMinutes - e.g. 15 or 30 minutes
 * @param {number} intervalMinutes - e.g. 5 or 15 minutes
 */
function getOpeningRange(candles = [], durationMinutes = 15, intervalMinutes = 15) {
    if (!candles || candles.length === 0) return { orbHigh: null, orbLow: null, candleCount: 0 };

    let orbHigh = -Infinity;
    let orbLow = Infinity;
    let count = 0;

    const interval = Number(intervalMinutes) || 15;
    const requiredCandlesCount = Math.max(1, Math.ceil(durationMinutes / interval));
    const slice = candles.slice(0, requiredCandlesCount);

    for (const c of slice) {
        const highVal = Number(c.high ?? c.candleHigh ?? c.close ?? 0);
        const lowVal = Number(c.low ?? c.candleLow ?? c.close ?? Infinity);
        if (highVal > orbHigh) orbHigh = highVal;
        if (lowVal < orbLow) orbLow = lowVal;
        count++;
    }

    return {
        orbHigh: orbHigh === -Infinity ? null : orbHigh,
        orbLow: orbLow === Infinity ? null : orbLow,
        candleCount: count
    };
}

module.exports = { getOpeningRange };
