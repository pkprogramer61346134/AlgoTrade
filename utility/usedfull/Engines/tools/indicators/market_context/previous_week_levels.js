/**
 * Calculates Previous Week High (PWH), Low (PWL), and Close (PWC)
 * @param {Array} candles - Array of candles spanning the previous week
 */
function getPreviousWeekLevels(candles = []) {
    if (!candles || candles.length === 0) return { pwh: null, pwl: null, pwc: null };
    let pwh = -Infinity, pwl = Infinity;
    const pwc = candles[candles.length - 1].close;

    for (const c of candles) {
        if (c.high > pwh) pwh = c.high;
        if (c.low < pwl) pwl = c.low;
    }

    return { pwh: pwh === -Infinity ? null : pwh, pwl: pwl === Infinity ? null : pwl, pwc };
}

module.exports = { getPreviousWeekLevels };
