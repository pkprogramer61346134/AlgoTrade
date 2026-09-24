/**
 * Calculates Intraday Volume Weighted Average Price (VWAP)
 * VWAP resets each trading day if date changes, or cumulative across array
 * @param {Array} candles - Array of candle objects with high, low, close, volume, date
 */
function calculateVWAP(candles = []) {
    if (!candles || candles.length === 0) return [];

    const vwapValues = [];
    let cumulativeTPV = 0; // Typical Price * Volume
    let cumulativeVolume = 0;
    let currentDate = null;

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        // Reset cumulative counters on new trading day
        if (c.date && c.date !== currentDate) {
            currentDate = c.date;
            cumulativeTPV = 0;
            cumulativeVolume = 0;
        }

        const typicalPrice = (c.high + c.low + c.close) / 3;
        const vol = c.volume || 0;

        cumulativeTPV += typicalPrice * vol;
        cumulativeVolume += vol;

        const vwap = cumulativeVolume > 0 ? (cumulativeTPV / cumulativeVolume) : typicalPrice;
        vwapValues.push(vwap);
    }

    return vwapValues;
}

module.exports = { calculateVWAP };
