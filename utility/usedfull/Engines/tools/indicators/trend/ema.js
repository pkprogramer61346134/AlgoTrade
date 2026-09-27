/**
 * Calculates Exponential Moving Average (EMA) for an array of candles or prices
 * @param {Array} data - Array of candles or numbers
 * @param {number} period - EMA period (e.g. 9, 20, 50, 200)
 */
function calculateEMA(data = [], period = 20) {
    if (!data || data.length < period) return [];

    const prices = data.map(d => typeof d === 'object' ? Number(d.close ?? d.candleClose ?? d.price ?? 0) : Number(d || 0));
    const k = 2 / (period + 1);
    const emaValues = new Array(prices.length).fill(null);

    // Initial SMA for first period
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += prices[i];
    }
    let currentEMA = sum / period;
    emaValues[period - 1] = currentEMA;

    for (let i = period; i < prices.length; i++) {
        currentEMA = (prices[i] * k) + (currentEMA * (1 - k));
        emaValues[i] = currentEMA;
    }

    return emaValues;
}

module.exports = { calculateEMA };
