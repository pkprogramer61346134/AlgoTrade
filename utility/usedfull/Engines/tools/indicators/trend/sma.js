/**
 * Calculates Simple Moving Average (SMA)
 * @param {Array} data - Array of candles or numbers
 * @param {number} period - SMA period
 */
function calculateSMA(data = [], period = 20) {
    if (!data || data.length < period) return [];

    const prices = data.map(d => typeof d === 'object' ? d.close : d);
    const smaValues = new Array(prices.length).fill(null);

    let windowSum = 0;
    for (let i = 0; i < period; i++) {
        windowSum += prices[i];
    }
    smaValues[period - 1] = windowSum / period;

    for (let i = period; i < prices.length; i++) {
        windowSum += prices[i] - prices[i - period];
        smaValues[i] = windowSum / period;
    }

    return smaValues;
}

module.exports = { calculateSMA };
