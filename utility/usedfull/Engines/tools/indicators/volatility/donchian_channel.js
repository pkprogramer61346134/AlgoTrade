/**
 * Calculates Donchian Channels (Upper High, Lower Low, Middle)
 * @param {Array} candles - Array of candles
 * @param {number} period - Lookback period (default 20)
 */
function calculateDonchianChannels(candles = [], period = 20) {
    if (!candles || candles.length < period) return [];

    const channels = new Array(candles.length).fill(null);

    for (let i = period - 1; i < candles.length; i++) {
        const slice = candles.slice(i - period + 1, i + 1);
        const upper = Math.max(...slice.map(c => c.high));
        const lower = Math.min(...slice.map(c => c.low));
        const middle = (upper + lower) / 2;

        channels[i] = { upper, middle, lower };
    }

    return channels;
}

module.exports = { calculateDonchianChannels };
