/**
 * Analyzes Market Structure (BOS - Break of Structure, CHoCH - Change of Character)
 * @param {Array} candles - Array of candle objects
 */
function analyzeMarketStructure(candles = []) {
    if (!candles || candles.length < 5) return { structure: "NEUTRAL", events: [] };

    const events = [];
    let lastSwingHigh = candles[0].high;
    let lastSwingLow = candles[0].low;
    let currentTrend = "NEUTRAL";

    for (let i = 2; i < candles.length - 2; i++) {
        // Swing High
        if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i - 2].high &&
            candles[i].high > candles[i + 1].high && candles[i].high > candles[i + 2].high) {
            lastSwingHigh = candles[i].high;
        }
        // Swing Low
        if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i - 2].low &&
            candles[i].low < candles[i + 1].low && candles[i].low < candles[i + 2].low) {
            lastSwingLow = candles[i].low;
        }

        const currClose = candles[i].close;

        // Bullish BOS
        if (currClose > lastSwingHigh) {
            events.push({ index: i, type: currentTrend === "BEARISH" ? "CHoCH_BULLISH" : "BOS_BULLISH", level: lastSwingHigh });
            currentTrend = "BULLISH";
            lastSwingHigh = candles[i].high;
        }
        // Bearish BOS
        else if (currClose < lastSwingLow) {
            events.push({ index: i, type: currentTrend === "BULLISH" ? "CHoCH_BEARISH" : "BOS_BEARISH", level: lastSwingLow });
            currentTrend = "BEARISH";
            lastSwingLow = candles[i].low;
        }
    }

    return { currentTrend, events, lastSwingHigh, lastSwingLow };
}

module.exports = { analyzeMarketStructure };
