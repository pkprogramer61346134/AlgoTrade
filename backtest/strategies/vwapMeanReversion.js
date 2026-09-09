const indicators = require('../../indicators');

function prepareVWAPData(candles) {
    const vwap = indicators.trend.calculateVWAP(candles);
    const bb = indicators.volatility.calculateBollingerBands(candles, 20, 2);
    const atr = indicators.volatility.calculateATR(candles, 14);

    return { vwap, bb, atr };
}

function evaluateVWAPReversion(candles, i, data) {
    if (i < 25) return { type: "NONE" };

    const currCandle = candles[i];
    const currVWAP = data.vwap[i];
    const currBB = data.bb[i];
    const currATR = data.atr[i] || 15;

    if (!currBB || !currVWAP) return { type: "NONE" };

    // BUY: Price touches lower BB band & bounces back above VWAP
    if (currCandle.low <= currBB.lower && currCandle.close > currVWAP) {
        const stopLoss = currCandle.low - (0.5 * currATR);
        const risk = currCandle.close - stopLoss;
        const targetPrice = currBB.upper;

        return {
            type: "BUY",
            entryPrice: currCandle.close,
            stopLoss: Number(stopLoss.toFixed(2)),
            targetPrice: Number(targetPrice.toFixed(2))
        };
    }

    // SELL: Price touches upper BB band & falls back below VWAP
    if (currCandle.high >= currBB.upper && currCandle.close < currVWAP) {
        const stopLoss = currCandle.high + (0.5 * currATR);
        const risk = stopLoss - currCandle.close;
        const targetPrice = currBB.lower;

        return {
            type: "SELL",
            entryPrice: currCandle.close,
            stopLoss: Number(stopLoss.toFixed(2)),
            targetPrice: Number(targetPrice.toFixed(2))
        };
    }

    return { type: "NONE" };
}

module.exports = { prepareVWAPData, evaluateVWAPReversion };
