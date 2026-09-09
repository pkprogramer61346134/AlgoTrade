/**
 * Evaluates Candle Body Strength (0 to 100) and Bullish/Bearish conviction
 * @param {Object} candle - Single candle object { open, high, low, close }
 */
function evaluateCandleStrength(candle) {
    if (!candle) return null;

    const totalRange = candle.high - candle.low;
    if (totalRange === 0) return { strength: 0, bias: "NEUTRAL", bodyRatio: 0 };

    const bodySize = Math.abs(candle.close - candle.open);
    const bodyRatio = (bodySize / totalRange) * 100;
    const isBullish = candle.close >= candle.open;

    return {
        strength: Number(bodyRatio.toFixed(2)),
        bias: isBullish ? "BULLISH" : "BEARISH",
        isMarubozu: bodyRatio >= 85
    };
}

module.exports = { evaluateCandleStrength };
