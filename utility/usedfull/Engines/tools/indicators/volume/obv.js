/**
 * Calculates On-Balance Volume (OBV)
 * @param {Array} candles - Array of candle objects
 */
function calculateOBV(candles = []) {
    if (!candles || candles.length === 0) return [];

    const obvValues = new Array(candles.length).fill(0);
    let currentOBV = 0;

    for (let i = 1; i < candles.length; i++) {
        const currClose = candles[i].close;
        const prevClose = candles[i - 1].close;
        const vol = candles[i].volume || 0;

        if (currClose > prevClose) {
            currentOBV += vol;
        } else if (currClose < prevClose) {
            currentOBV -= vol;
        }

        obvValues[i] = currentOBV;
    }

    return obvValues;
}

module.exports = { calculateOBV };
