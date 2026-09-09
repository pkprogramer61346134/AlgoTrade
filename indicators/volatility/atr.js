/**
 * Calculates Average True Range (ATR)
 * @param {Array} candles - Array of candle objects
 * @param {number} period - ATR period (default 14)
 */
function calculateATR(candles = [], period = 14) {
    if (!candles || candles.length < period) return [];

    const n = candles.length;
    const tr = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
        if (i === 0) {
            tr[i] = candles[i].high - candles[i].low;
        } else {
            const h = candles[i].high;
            const l = candles[i].low;
            const pc = candles[i - 1].close;
            tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        }
    }

    const atr = new Array(n).fill(null);
    let sumTR = 0;
    for (let i = 0; i < period; i++) sumTR += tr[i];
    atr[period - 1] = sumTR / period;

    for (let i = period; i < n; i++) {
        atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
    }

    return atr;
}

module.exports = { calculateATR };
