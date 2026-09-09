/**
 * Calculates Rate of Change (ROC) indicator
 * @param {Array} candles - Array of candles
 * @param {number} period - ROC period (default 12)
 */
function calculateROC(candles = [], period = 12) {
    if (!candles || candles.length <= period) return [];

    const rocValues = new Array(candles.length).fill(null);
    for (let i = period; i < candles.length; i++) {
        const currClose = candles[i].close;
        const prevClose = candles[i - period].close;
        rocValues[i] = prevClose === 0 ? 0 : ((currClose - prevClose) / prevClose) * 100;
    }

    return rocValues;
}

module.exports = { calculateROC };
