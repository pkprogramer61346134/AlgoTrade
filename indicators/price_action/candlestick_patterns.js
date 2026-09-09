/**
 * Identifies Candlestick Patterns (Doji, Hammer, Engulfing, Marubozu, Shooting Star)
 * @param {Array} candles - Array of candle objects
 */
function detectCandlestickPatterns(candles = []) {
    if (!candles || candles.length === 0) return [];

    const patterns = [];
    const n = candles.length;
    const curr = candles[n - 1];
    const prev = n > 1 ? candles[n - 2] : null;

    const totalRange = curr.high - curr.low;
    if (totalRange === 0) return patterns;

    const bodySize = Math.abs(curr.close - curr.open);
    const upperWick = curr.high - Math.max(curr.open, curr.close);
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;

    // Doji
    if (bodySize / totalRange <= 0.1) {
        patterns.push({ name: "DOJI", type: "NEUTRAL", candle: curr });
    }

    // Hammer / Pinbar
    if (lowerWick >= (2 * bodySize) && upperWick <= (0.5 * bodySize)) {
        patterns.push({ name: "HAMMER", type: "BULLISH", candle: curr });
    }

    // Shooting Star
    if (upperWick >= (2 * bodySize) && lowerWick <= (0.5 * bodySize)) {
        patterns.push({ name: "SHOOTING_STAR", type: "BEARISH", candle: curr });
    }

    // Marubozu
    if (bodySize / totalRange >= 0.85) {
        patterns.push({ name: curr.close >= curr.open ? "BULLISH_MARUBOZU" : "BEARISH_MARUBOZU", type: curr.close >= curr.open ? "BULLISH" : "BEARISH", candle: curr });
    }

    // Engulfing (requires prev candle)
    if (prev) {
        const prevBody = Math.abs(prev.close - prev.open);
        const isPrevBearish = prev.close < prev.open;
        const isCurrBullish = curr.close > curr.open;

        if (isPrevBearish && isCurrBullish && curr.close > prev.open && curr.open < prev.close) {
            patterns.push({ name: "BULLISH_ENGULFING", type: "BULLISH", candle: curr });
        } else if (!isPrevBearish && !isCurrBullish && curr.close < prev.open && curr.open > prev.close) {
            patterns.push({ name: "BEARISH_ENGULFING", type: "BEARISH", candle: curr });
        }
    }

    return patterns;
}

module.exports = { detectCandlestickPatterns };
