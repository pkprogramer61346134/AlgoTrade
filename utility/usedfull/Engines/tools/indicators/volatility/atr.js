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
        const h = Number(candles[i].high ?? candles[i].candleHigh ?? candles[i].close ?? candles[i].price ?? 0);
        const l = Number(candles[i].low ?? candles[i].candleLow ?? candles[i].close ?? candles[i].price ?? 0);
        if (i === 0) {
            tr[i] = h - l;
        } else {
            const pc = Number(candles[i - 1].close ?? candles[i - 1].candleClose ?? candles[i - 1].price ?? 0);
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
