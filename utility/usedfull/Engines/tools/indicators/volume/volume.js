/**
 * Extracts and calculates raw Volume metrics and summary statistics
 * @param {Array} candles - Array of candle objects
 */
function getVolumeMetrics(candles = []) {
    if (!candles || candles.length === 0) return { totalVolume: 0, avgVolume: 0, latestVolume: 0 };

    const latestVolume = candles[candles.length - 1].volume || 0;
    const totalVolume = candles.reduce((acc, c) => acc + (c.volume || 0), 0);
    const avgVolume = totalVolume / candles.length;

    return {
        totalVolume,
        avgVolume: Number(avgVolume.toFixed(2)),
        latestVolume
    };
}

module.exports = { getVolumeMetrics };
