/**
 * Calculates Relative Volume (RVOL) = Current Volume / Average N-period Volume
 * @param {Array} candles - Array of candle objects
 * @param {number} period - Average volume lookback period (default 20)
 */
function calculateRelativeVolume(candles = [], period = 20) {
    if (!candles || candles.length < period) return [];

    const rvolValues = new Array(candles.length).fill(null);

    for (let i = period; i < candles.length; i++) {
        const slice = candles.slice(i - period, i);
        const sumVol = slice.reduce((acc, c) => acc + (c.volume || 0), 0);
        const avgVol = sumVol / period;
        const currVol = candles[i].volume || 0;

        rvolValues[i] = avgVol === 0 ? 1 : Number((currVol / avgVol).toFixed(2));
    }

    return rvolValues;
}

module.exports = { calculateRelativeVolume };
