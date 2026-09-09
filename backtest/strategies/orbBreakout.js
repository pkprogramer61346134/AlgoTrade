const indicators = require('../../indicators');

function prepareORBData(candles) {
    const atr = indicators.volatility.calculateATR(candles, 14);
    const rvol = indicators.volume.calculateRelativeVolume(candles, 20);

    // Precalculate ORB High/Low per trading day
    const dayORB = {};
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (!c.date) continue;

        if (!dayORB[c.date]) {
            dayORB[c.date] = { high: -Infinity, low: Infinity, count: 0 };
        }

        // First 3 candles of 5-min or first 1 candle of 15-min (first 15 minutes)
        if (dayORB[c.date].count < 3) {
            if (c.high > dayORB[c.date].high) dayORB[c.date].high = c.high;
            if (c.low < dayORB[c.date].low) dayORB[c.date].low = c.low;
            dayORB[c.date].count++;
        }
    }

    return { atr, rvol, dayORB };
}

function evaluateORBBreakout(candles, i, data) {
    if (i < 5) return { type: "NONE" };

    const currCandle = candles[i];
    const orb = data.dayORB[currCandle.date];
    if (!orb || orb.high === -Infinity || orb.count < 3) return { type: "NONE" };

    const currRVOL = data.rvol[i] || 1.0;

    // BUY: Breakout above ORB High with RVOL >= 1.2x
    if (currCandle.close > orb.high && currRVOL >= 1.2) {
        const stopLoss = orb.low;
        const risk = currCandle.close - stopLoss;
        if (risk <= 0) return { type: "NONE" };

        const targetPrice = currCandle.close + (2.0 * risk);

        return {
            type: "BUY",
            entryPrice: currCandle.close,
            stopLoss: Number(stopLoss.toFixed(2)),
            targetPrice: Number(targetPrice.toFixed(2))
        };
    }

    // SELL: Breakdown below ORB Low with RVOL >= 1.2x
    if (currCandle.close < orb.low && currRVOL >= 1.2) {
        const stopLoss = orb.high;
        const risk = stopLoss - currCandle.close;
        if (risk <= 0) return { type: "NONE" };

        const targetPrice = currCandle.close - (2.0 * risk);

        return {
            type: "SELL",
            entryPrice: currCandle.close,
            stopLoss: Number(stopLoss.toFixed(2)),
            targetPrice: Number(targetPrice.toFixed(2))
        };
    }

    return { type: "NONE" };
}

module.exports = { prepareORBData, evaluateORBBreakout };
