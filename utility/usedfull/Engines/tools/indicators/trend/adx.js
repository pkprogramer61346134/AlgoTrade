/**
 * Calculates ADX (Average Directional Index), +DI, and -DI
 * @param {Array} candles - Array of candle objects
 * @param {number} period - Smoothing period (default 14)
 */
function calculateADX(candles = [], period = 14) {
    if (!candles || candles.length < period * 2) return [];

    const n = candles.length;
    const tr = new Array(n).fill(0);
    const plusDM = new Array(n).fill(0);
    const minusDM = new Array(n).fill(0);

    for (let i = 1; i < n; i++) {
        const upMove = candles[i].high - candles[i - 1].high;
        const downMove = candles[i - 1].low - candles[i].low;

        plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
        minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;

        const h = candles[i].high;
        const l = candles[i].low;
        const pc = candles[i - 1].close;
        tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }

    // Smoothed TR, +DM, -DM
    let trSmooth = 0, plusDMSmooth = 0, minusDMSmooth = 0;
    for (let i = 1; i <= period; i++) {
        trSmooth += tr[i];
        plusDMSmooth += plusDM[i];
        minusDMSmooth += minusDM[i];
    }

    const plusDI = new Array(n).fill(null);
    const minusDI = new Array(n).fill(null);
    const dx = new Array(n).fill(null);
    const adx = new Array(n).fill(null);

    plusDI[period] = (plusDMSmooth / trSmooth) * 100;
    minusDI[period] = (minusDMSmooth / trSmooth) * 100;
    dx[period] = Math.abs(plusDI[period] - minusDI[period]) / (plusDI[period] + minusDI[period]) * 100;

    for (let i = period + 1; i < n; i++) {
        trSmooth = trSmooth - (trSmooth / period) + tr[i];
        plusDMSmooth = plusDMSmooth - (plusDMSmooth / period) + plusDM[i];
        minusDMSmooth = minusDMSmooth - (minusDMSmooth / period) + minusDM[i];

        plusDI[i] = (plusDMSmooth / trSmooth) * 100;
        minusDI[i] = (minusDMSmooth / trSmooth) * 100;

        const diSum = plusDI[i] + minusDI[i];
        dx[i] = diSum === 0 ? 0 : Math.abs(plusDI[i] - minusDI[i]) / diSum * 100;
    }

    // ADX is SMA of DX over period
    let dxSum = 0;
    const startIdx = period * 2 - 1;
    for (let i = period; i <= startIdx; i++) {
        dxSum += dx[i];
    }
    adx[startIdx] = dxSum / period;

    for (let i = startIdx + 1; i < n; i++) {
        adx[i] = ((adx[i - 1] * (period - 1)) + dx[i]) / period;
    }

    return candles.map((c, idx) => ({
        adx: adx[idx],
        plusDI: plusDI[idx],
        minusDI: minusDI[idx]
    }));
}

module.exports = { calculateADX };
