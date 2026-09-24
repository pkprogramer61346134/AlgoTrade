/**
 * Analyzes Upper & Lower Wicks to measure selling/buying rejection pressure
 * @param {Object} candle - Single candle object
 */
function analyzeWicks(candle) {
    if (!candle) return null;

    const totalRange = candle.high - candle.low;
    if (totalRange === 0) return { upperWickRatio: 0, lowerWickRatio: 0, rejection: "NONE" };

    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;

    const upperWickRatio = (upperWick / totalRange) * 100;
    const lowerWickRatio = (lowerWick / totalRange) * 100;

    let rejection = "NONE";
    if (upperWickRatio > 50) rejection = "SELLING_REJECTION";
    else if (lowerWickRatio > 50) rejection = "BUYING_REJECTION";

    return {
        upperWickRatio: Number(upperWickRatio.toFixed(2)),
        lowerWickRatio: Number(lowerWickRatio.toFixed(2)),
        rejection
    };
}

module.exports = { analyzeWicks };
