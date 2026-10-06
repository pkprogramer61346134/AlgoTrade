/**
 * Identifies Trendlines & Detects Trendline Breakouts / Touches
 * Location: C:\AlgoTrade\utility\usedfull\Engines\tools\indicators\price_action\trendline.js
 * 
 * @param {Array} candles - Array of candle objects
 * @param {number} lookback - Number of candles to scan for trendline construction (default 30)
 * @returns {Object} Trendline analysis result { bullishBreakout, bearishBreakout, resistanceLine, supportLine }
 */
function detectTrendlineBreakout(candles = [], lookback = 30) {
    if (!candles || candles.length < 10) {
        return { bullishBreakout: false, bearishBreakout: false, resistanceLine: null, supportLine: null };
    }

    const n = candles.length - 1;
    const sliceStart = Math.max(0, candles.length - lookback);
    const subCandles = candles.slice(sliceStart);

    // 1. Identify Swing Highs & Swing Lows in window
    const swingHighs = [];
    const swingLows = [];

    for (let i = 2; i < subCandles.length - 2; i++) {
        const currHigh = subCandles[i].high || subCandles[i].candleHigh || subCandles[i].close;
        const currLow = subCandles[i].low || subCandles[i].candleLow || subCandles[i].close;

        // Swing High
        if (currHigh > (subCandles[i-1].high || subCandles[i-1].close) &&
            currHigh > (subCandles[i-2].high || subCandles[i-2].close) &&
            currHigh > (subCandles[i+1].high || subCandles[i+1].close) &&
            currHigh > (subCandles[i+2].high || subCandles[i+2].close)) {
            swingHighs.push({ index: sliceStart + i, price: currHigh });
        }

        // Swing Low
        if (currLow < (subCandles[i-1].low || subCandles[i-1].close) &&
            currLow < (subCandles[i-2].low || subCandles[i-2].close) &&
            currLow < (subCandles[i+1].low || subCandles[i+1].close) &&
            currLow < (subCandles[i+2].low || subCandles[i+2].close)) {
            swingLows.push({ index: sliceStart + i, price: currLow });
        }
    }

    const currentClose = candles[n].close || candles[n].candleClose || candles[n].price;
    let bullishBreakout = false;
    let bearishBreakout = false;
    let resLine = null;
    let supLine = null;

    // 2. Resistance Trendline Breakout (Descending Trendline connecting 2 swing highs)
    if (swingHighs.length >= 2) {
        const p1 = swingHighs[swingHighs.length - 2];
        const p2 = swingHighs[swingHighs.length - 1];

        const slope = (p2.price - p1.price) / (p2.index - p1.index);
        const projectedRes = p2.price + slope * (n - p2.index);

        resLine = { projected: projectedRes, slope };

        // Descending trendline breakout: slope <= 0 and current close > projected trendline price
        if (slope <= 0.5 && currentClose > projectedRes) {
            bullishBreakout = true;
        }
    }

    // 3. Support Trendline Breakdown (Ascending Trendline connecting 2 swing lows)
    if (swingLows.length >= 2) {
        const p1 = swingLows[swingLows.length - 2];
        const p2 = swingLows[swingLows.length - 1];

        const slope = (p2.price - p1.price) / (p2.index - p1.index);
        const projectedSup = p2.price + slope * (n - p2.index);

        supLine = { projected: projectedSup, slope };

        // Ascending trendline breakdown: slope >= -0.5 and current close < projected trendline price
        if (slope >= -0.5 && currentClose < projectedSup) {
            bearishBreakout = true;
        }
    }

    return {
        bullishBreakout,
        bearishBreakout,
        resistanceLine: resLine,
        supportLine: supLine
    };
}

module.exports = { detectTrendlineBreakout };
