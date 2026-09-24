/**
 * Analyzes Gaps between sessions or consecutive candles
 * @param {Array} candles - Array of candle objects
 */
function analyzeGap(candles = []) {
    if (!candles || candles.length < 2) return { isGap: false };

    const curr = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    let type = "NO_GAP";
    let gapSize = 0;

    if (curr.open > prev.high) {
        type = "GAP_UP";
        gapSize = curr.open - prev.high;
    } else if (curr.open < prev.low) {
        type = "GAP_DOWN";
        gapSize = prev.low - curr.open;
    }

    const isFilled = type === "GAP_UP" ? curr.low <= prev.high : (type === "GAP_DOWN" ? curr.high >= prev.low : true);

    return {
        isGap: type !== "NO_GAP",
        type,
        gapSize: Number(gapSize.toFixed(2)),
        isFilled
    };
}

module.exports = { analyzeGap };
