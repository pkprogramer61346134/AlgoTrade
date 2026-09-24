/**
 * Calculates Opening Range Breakout (ORB) High and Low
 * @param {Array} candles - Array of intraday candles starting from market open
 * @param {number} durationMinutes - e.g. 15 or 30 minutes
 */
function getOpeningRange(candles = [], durationMinutes = 15) {
    if (!candles || candles.length === 0) return { orbHigh: null, orbLow: null };

    // Group candles that fall within the first N minutes
    // Each candle has time string e.g. "9:15:00 AM" or timestamp
    let orbHigh = -Infinity;
    let orbLow = Infinity;
    let count = 0;

    // Standard market open at 09:15 AM
    // For N-minute ORB with 5-minute candles: durationMinutes/5 candles
    const requiredCandlesCount = Math.max(1, Math.floor(durationMinutes / 5));
    const slice = candles.slice(0, requiredCandlesCount);

    for (const c of slice) {
        if (c.high > orbHigh) orbHigh = c.high;
        if (c.low < orbLow) orbLow = c.low;
        count++;
    }

    return {
        orbHigh: orbHigh === -Infinity ? null : orbHigh,
        orbLow: orbLow === Infinity ? null : orbLow,
        candleCount: count
    };
}

module.exports = { getOpeningRange };
