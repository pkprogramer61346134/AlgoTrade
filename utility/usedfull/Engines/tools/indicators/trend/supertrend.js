/**
 * Calculates Supertrend indicator (Line value and Direction: 1 for Bullish, -1 for Bearish)
 * @param {Array} candles - Array of candle objects
 * @param {number} period - ATR period (default 10)
 * @param {number} multiplier - ATR multiplier (default 3)
 */
function calculateSupertrend(candles = [], period = 10, multiplier = 3) {
    if (!candles || candles.length < period) return [];

    const n = candles.length;
    // Calculate True Range (TR)
    const tr = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        const h = Number(candles[i].high ?? candles[i].candleHigh ?? candles[i].close ?? candles[i].price ?? 0);
        const l = Number(candles[i].low ?? candles[i].candleLow ?? candles[i].close ?? candles[i].price ?? 0);
        const c = Number(candles[i].close ?? candles[i].candleClose ?? candles[i].price ?? 0);
        if (i === 0) {
            tr[i] = h - l;
        } else {
            const pc = Number(candles[i - 1].close ?? candles[i - 1].candleClose ?? candles[i - 1].price ?? 0);
            tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        }
    }

    // Calculate ATR (Wilder's Smoothing)
    const atr = new Array(n).fill(0);
    let sumTR = 0;
    for (let i = 0; i < period; i++) sumTR += tr[i];
    atr[period - 1] = sumTR / period;

    for (let i = period; i < n; i++) {
        atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
    }

    const supertrend = new Array(n).fill(null);
    const direction = new Array(n).fill(1); // 1 = Buy/Bullish, -1 = Sell/Bearish

    let upperBand = new Array(n).fill(0);
    let lowerBand = new Array(n).fill(0);

    for (let i = period - 1; i < n; i++) {
        const h = Number(candles[i].high ?? candles[i].candleHigh ?? candles[i].close ?? candles[i].price ?? 0);
        const l = Number(candles[i].low ?? candles[i].candleLow ?? candles[i].close ?? candles[i].price ?? 0);
        const c = Number(candles[i].close ?? candles[i].candleClose ?? candles[i].price ?? 0);
        const prevC = Number(candles[i - 1]?.close ?? candles[i - 1]?.candleClose ?? candles[i - 1]?.price ?? c);
        const hl2 = (h + l) / 2;
        let basicUpper = hl2 + (multiplier * atr[i]);
        let basicLower = hl2 - (multiplier * atr[i]);

        if (i === period - 1) {
            upperBand[i] = basicUpper;
            lowerBand[i] = basicLower;
        } else {
            upperBand[i] = (basicUpper < upperBand[i - 1] || prevC > upperBand[i - 1]) ? basicUpper : upperBand[i - 1];
            lowerBand[i] = (basicLower > lowerBand[i - 1] || prevC < lowerBand[i - 1]) ? basicLower : lowerBand[i - 1];
        }

        if (i === period - 1) {
            direction[i] = c <= upperBand[i] ? -1 : 1;
        } else {
            if (direction[i - 1] === 1) {
                direction[i] = c < lowerBand[i] ? -1 : 1;
            } else {
                direction[i] = c > upperBand[i] ? 1 : -1;
            }
        }

        supertrend[i] = direction[i] === 1 ? lowerBand[i] : upperBand[i];
    }

    return candles.map((c, idx) => ({
        supertrend: supertrend[idx],
        direction: direction[idx]
    }));
}

module.exports = { calculateSupertrend };
