const { calculateRelativeVolume } = require('./relative_volume');

/**
 * Detects Volume Spikes (Volume > Multiplier * Avg Volume)
 * @param {Array} candles - Array of candles
 * @param {number} thresholdRvol - RVOL threshold (default 2.0x)
 */
function detectVolumeSpike(candles = [], thresholdRvol = 2.0) {
    const rvolList = calculateRelativeVolume(candles);
    if (!rvolList || rvolList.length === 0) return { isSpike: false, rvol: 0 };

    const latestRvol = rvolList[rvolList.length - 1] || 0;
    return {
        isSpike: latestRvol >= thresholdRvol,
        rvol: latestRvol,
        latestVolume: candles[candles.length - 1].volume || 0
    };
}

module.exports = { detectVolumeSpike };
