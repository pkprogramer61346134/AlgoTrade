const indicators = require('../../indicators');

function prepareComboData(candles) {
    const supertrend = indicators.trend.calculateSupertrend(candles, 10, 3);
    const ema50 = indicators.trend.calculateEMA(candles, 50);
    const rvol = indicators.volume.calculateRelativeVolume(candles, 20);
    const atr = indicators.volatility.calculateATR(candles, 14);

    const dayORB = {};
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (!c.date) continue;

        if (!dayORB[c.date]) {
            dayORB[c.date] = { high: -Infinity, low: Infinity, count: 0 };
        }

        if (dayORB[c.date].count < 3) {
            if (c.high > dayORB[c.date].high) dayORB[c.date].high = c.high;
            if (c.low < dayORB[c.date].low) dayORB[c.date].low = c.low;
            dayORB[c.date].count++;
        }
    }

    return { supertrend, ema50, rvol, atr, dayORB };
}

function evaluateComboStrategy(candles, i, data) {
    if (i < 50) return { type: "NONE" };

    const currCandle = candles[i];
    const orb = data.dayORB[currCandle.date];
    if (!orb || orb.high === -Infinity || orb.count < 3) return { type: "NONE" };

    const currST = data.supertrend[i];
    const currEMA50 = data.ema50[i];
    const currRVOL = data.rvol[i] || 1.0;
    const currATR = data.atr[i] || 15;

    if (!currST || !currEMA50) return { type: "NONE" };

    // HIGH WIN-RATE BUY SIGNAL:
    // 1. Breakout above ORB High
    // 2. Supertrend is GREEN
    // 3. Price > EMA 50 (Trend Filter)
    // 4. RVOL >= 1.5x (Volume Confirmation)
    if (currCandle.close > orb.high && currST.direction === 1 && currCandle.close > currEMA50 && currRVOL >= 1.5) {
        const stopLoss = Math.max(orb.low, currCandle.close - (1.2 * currATR));
        const risk = currCandle.close - stopLoss;
        if (risk <= 0) return { type: "NONE" };

        const targetPrice = currCandle.close + (2.5 * risk); // 1:2.5 Risk-Reward

        return {
            type: "BUY",
            entryPrice: currCandle.close,
            stopLoss: Number(stopLoss.toFixed(2)),
            targetPrice: Number(targetPrice.toFixed(2))
        };
    }

    // HIGH WIN-RATE SELL SIGNAL:
    if (currCandle.close < orb.low && currST.direction === -1 && currCandle.close < currEMA50 && currRVOL >= 1.5) {
        const stopLoss = Math.min(orb.high, currCandle.close + (1.2 * currATR));
        const risk = stopLoss - currCandle.close;
        if (risk <= 0) return { type: "NONE" };

        const targetPrice = currCandle.close - (2.5 * risk);

        return {
            type: "SELL",
            entryPrice: currCandle.close,
            stopLoss: Number(stopLoss.toFixed(2)),
            targetPrice: Number(targetPrice.toFixed(2))
        };
    }

    return { type: "NONE" };
}

module.exports = { prepareComboData, evaluateComboStrategy };
