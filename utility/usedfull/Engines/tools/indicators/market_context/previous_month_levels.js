/**
 * Calculates Previous Month High (PMH), Low (PML), and Close (PMC)
 * @param {Array} candles - Array of candles spanning the previous month
 */
function getPreviousMonthLevels(candles = []) {
    if (!candles || candles.length === 0) return { pmh: null, pml: null, pmc: null };
    let pmh = -Infinity, pml = Infinity;
    const pmc = candles[candles.length - 1].close;

    for (const c of candles) {
        if (c.high > pmh) pmh = c.high;
        if (c.low < pml) pml = c.low;
    }

    return { pmh: pmh === -Infinity ? null : pmh, pml: pml === Infinity ? null : pml, pmc };
}

module.exports = { getPreviousMonthLevels };
