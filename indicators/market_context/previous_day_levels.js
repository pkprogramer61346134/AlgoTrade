/**
 * Calculates Previous Day High (PDH), Low (PDL), and Close (PDC) from candle data
 * @param {Array} candles - Array of candle objects
 */
function getPreviousDayLevels(candles = []) {
    if (!candles || candles.length === 0) {
        return { pdh: null, pdl: null, pdc: null, pdo: null };
    }

    let high = -Infinity;
    let low = Infinity;
    let open = candles[0].open;
    let close = candles[candles.length - 1].close;

    for (const c of candles) {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
    }

    return {
        pdh: high === -Infinity ? null : high,
        pdl: low === Infinity ? null : low,
        pdc: close,
        pdo: open
    };
}

module.exports = { getPreviousDayLevels };
