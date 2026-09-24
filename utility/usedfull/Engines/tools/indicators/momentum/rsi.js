/**
 * Calculates Relative Strength Index (RSI) using Wilder's Smoothing
 * @param {Array} data - Array of candles or numbers
 * @param {number} period - RSI period (default 14)
 */
function calculateRSI(data = [], period = 14) {
    if (!data || data.length < period + 1) return [];

    const prices = data.map(d => typeof d === 'object' ? d.close : d);
    const rsiValues = new Array(prices.length).fill(null);

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change >= 0) gains += change;
        else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues[period] = 100 - (100 / (1 + rs));

    for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        const gain = change >= 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;

        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsiValues[i] = 100 - (100 / (1 + rs));
    }

    return rsiValues;
}

module.exports = { calculateRSI };
