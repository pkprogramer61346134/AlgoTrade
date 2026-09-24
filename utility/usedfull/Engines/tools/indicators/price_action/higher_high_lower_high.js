/**
 * Identifies Swing Highs, Swing Lows, Higher Highs (HH), Higher Lows (HL), Lower Highs (LH), Lower Lows (LL)
 * @param {Array} candles - Array of candle objects
 * @param {number} leftRightBars - Number of bars to left and right to confirm swing (default 2)
 */
function identifySwings(candles = [], leftRightBars = 2) {
    if (!candles || candles.length < (leftRightBars * 2 + 1)) return [];

    const swings = [];
    let prevHigh = null;
    let prevLow = null;

    for (let i = leftRightBars; i < candles.length - leftRightBars; i++) {
        let isSwingHigh = true;
        let isSwingLow = true;

        for (let j = 1; j <= leftRightBars; j++) {
            if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isSwingHigh = false;
            if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isSwingLow = false;
        }

        if (isSwingHigh) {
            let label = "SWING_HIGH";
            if (prevHigh !== null) {
                label = candles[i].high > prevHigh ? "HIGHER_HIGH" : "LOWER_HIGH";
            }
            prevHigh = candles[i].high;
            swings.push({ index: i, type: "HIGH", label, price: candles[i].high, candle: candles[i] });
        }

        if (isSwingLow) {
            let label = "SWING_LOW";
            if (prevLow !== null) {
                label = candles[i].low > prevLow ? "HIGHER_LOW" : "LOWER_LOW";
            }
            prevLow = candles[i].low;
            swings.push({ index: i, type: "LOW", label, price: candles[i].low, candle: candles[i] });
        }
    }

    return swings;
}

module.exports = { identifySwings };
