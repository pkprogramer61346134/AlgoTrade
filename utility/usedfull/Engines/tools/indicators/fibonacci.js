/**
 * Fibonacci Retracement Indicator (Custom 3-Levels)
 * Location: C:\AlgoTrade\utility\usedfull\Engines\tools\indicators\trend\fibonacci.js
 * 
 * Exact Levels Required: 0.44, 0.50, 0.56
 * These levels form a high-probability "Golden Zone" for reversals.
 */

/**
 * Calculate Custom Fibonacci levels based on recent candles
 * @param {Array} candles - Array of candle objects { open, high, low, close, ... }
 * @param {number} lookback - Number of candles to look back (default: 50)
 * @returns {Object} - { trend, swingHigh, swingLow, levels, goldenZone }
 */
function calculateFibonacci(candles, lookback = 50) {
    if (!candles || !Array.isArray(candles) || candles.length < lookback) {
        return {
            trend: "NEUTRAL",
            swingHigh: null,
            swingLow: null,
            levels: {},
            goldenZone: null
        };
    }

    // 1. Get recent candles to find the swings
    const recentCandles = candles.slice(-lookback);

    // 2. Find Swing High and Swing Low
    const highs = recentCandles.map(c => Number(c.high || c.candleHigh || c.close));
    const lows = recentCandles.map(c => Number(c.low || c.candleLow || c.close));

    const swingHigh = Math.max(...highs);
    const swingLow = Math.min(...lows);

    const highIndex = highs.indexOf(swingHigh);
    const lowIndex = lows.indexOf(swingLow);

    // 3. Determine Trend Direction
    // If Low came before High, it's an UPTREND. If High came before Low, it's a DOWNTREND.
    let trend = "NEUTRAL";
    if (lowIndex < highIndex) {
        trend = "UPTREND";
    } else if (highIndex < lowIndex) {
        trend = "DOWNTREND";
    }

    // 4. Calculate ONLY the 3 Required Fibonacci Levels
    const diff = swingHigh - swingLow;
    const levels = {};

    // आपके द्वारा मांगे गए तीन लेवल्स
    const targetRatios = {
        "0.44": 0.44,
        "0.50": 0.50,
        "0.56": 0.56
    };

    for (const [key, ratio] of Object.entries(targetRatios)) {
        if (trend === "UPTREND") {
            // For Uptrend: Price pulls back from High down to Low
            levels[key] = Number((swingHigh - (diff * ratio)).toFixed(2));
        } else {
            // For Downtrend: Price pulls back from Low up to High
            levels[key] = Number((swingLow + (diff * ratio)).toFixed(2));
        }
    }

    // 5. Define Golden Zone (0.44 to 0.56)
    const goldenZone = {
        upper: levels["0.56"], // 0.56 level
        lower: levels["0.44"]  // 0.44 level
    };

    return {
        trend: trend,
        swingHigh: Number(swingHigh.toFixed(2)),
        swingLow: Number(swingLow.toFixed(2)),
        levels: levels,       // इसमें सिर्फ 0.44, 0.50, 0.56 होंगे
        goldenZone: goldenZone,
        diff: Number(diff.toFixed(2))
    };
}

/**
 * Helper function to check if current price is inside the Golden Zone (0.44 - 0.56)
 * @param {number} price - Current price
 * @param {Object} fibData - Output from calculateFibonacci()
 * @param {number} tolerance - Extra points allowed above/below the zone (default: 5)
 * @returns {boolean}
 */
function isInGoldenZone(price, fibData, tolerance = 5) {
    if (!price || !fibData || !fibData.goldenZone) return false;

    const { lower, upper } = fibData.goldenZone;
    if (lower === null || upper === null) return false;

    // Check if price is between 0.44 and 0.56 (with some tolerance)
    return price >= (lower - tolerance) && price <= (upper + tolerance);
}

module.exports = {
    calculateFibonacci,
    isInGoldenZone
};