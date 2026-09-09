const indicators = require('../../indicators');

function prepareSupertrendEMAData(candles) {
    const ema9 = indicators.trend.calculateEMA(candles, 9);
    const ema20 = indicators.trend.calculateEMA(candles, 20);
    const supertrend = indicators.trend.calculateSupertrend(candles, 10, 3);
    const rsi = indicators.momentum.calculateRSI(candles, 14);
    const atr = indicators.volatility.calculateATR(candles, 14);

    return { ema9, ema20, supertrend, rsi, atr };
}

function evaluateSupertrendEMA(candles, i, data) {
    if (i < 25) return { type: "NONE" };

    const currCandle = candles[i];
    const currEMA9 = data.ema9[i];
    const prevEMA9 = data.ema9[i - 1];
    const currEMA20 = data.ema20[i];
    const prevEMA20 = data.ema20[i - 1];

    const currST = data.supertrend[i];
    const currRSI = data.rsi[i];
    const currATR = data.atr[i] || 15;

    if (!currST || currEMA9 === null || currEMA20 === null) return { type: "NONE" };

    // BUY Signal: Supertrend Green AND EMA 9 crosses above EMA 20 AND RSI > 50
    if (currST.direction === 1 && prevEMA9 <= prevEMA20 && currEMA9 > currEMA20 && currRSI > 50) {
        const stopLoss = currCandle.close - (1.5 * currATR);
        const risk = currCandle.close - stopLoss;
        const targetPrice = currCandle.close + (2.0 * risk);

        return {
            type: "BUY",
            entryPrice: currCandle.close,
            stopLoss: Number(stopLoss.toFixed(2)),
            targetPrice: Number(targetPrice.toFixed(2))
        };
    }

    // SELL Signal: Supertrend Red AND EMA 9 crosses below EMA 20 AND RSI < 50
    if (currST.direction === -1 && prevEMA9 >= prevEMA20 && currEMA9 < currEMA20 && currRSI < 50) {
        const stopLoss = currCandle.close + (1.5 * currATR);
        const risk = stopLoss - currCandle.close;
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

module.exports = { prepareSupertrendEMAData, evaluateSupertrendEMA };
