const indicators = require('../../indicators');

function prepareMACDData(candles) {
    const macd = indicators.momentum.calculateMACD(candles);
    const rsi = indicators.momentum.calculateRSI(candles, 14);
    const atr = indicators.volatility.calculateATR(candles, 14);

    return { macd, rsi, atr };
}

function evaluateMACDDivergence(candles, i, data) {
    if (i < 35) return { type: "NONE" };

    const currCandle = candles[i];
    const currMACD = data.macd[i];
    const prevMACD = data.macd[i - 1];
    const currRSI = data.rsi[i];
    const currATR = data.atr[i] || 15;

    if (!currMACD || !prevMACD || currMACD.histogram === null || prevMACD.histogram === null) return { type: "NONE" };

    // BUY: MACD Histogram flips from negative to positive AND RSI > 45
    if (prevMACD.histogram <= 0 && currMACD.histogram > 0 && currRSI > 45) {
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

    // SELL: MACD Histogram flips from positive to negative AND RSI < 55
    if (prevMACD.histogram >= 0 && currMACD.histogram < 0 && currRSI < 55) {
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

module.exports = { prepareMACDData, evaluateMACDDivergence };
