/**
 * Estimates Buying Volume vs Selling Volume Delta based on candle body & wicks
 * @param {Array} candles - Array of candle objects
 */
function calculateVolumeDelta(candles = []) {
    if (!candles || candles.length === 0) return [];

    return candles.map(c => {
        const totalRange = c.high - c.low;
        const vol = c.volume || 0;

        if (totalRange === 0) return { buyVolume: vol / 2, sellVolume: vol / 2, delta: 0 };

        // Ratio of close position relative to high/low range
        const buyRatio = (c.close - c.low) / totalRange;
        const buyVolume = vol * buyRatio;
        const sellVolume = vol * (1 - buyRatio);

        return {
            buyVolume: Math.round(buyVolume),
            sellVolume: Math.round(sellVolume),
            delta: Math.round(buyVolume - sellVolume)
        };
    });
}

module.exports = { calculateVolumeDelta };
