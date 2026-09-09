const indicators = require('../../indicators');

function prepareInstitutionalHighWinRateData(candles) {
    const ema20 = indicators.trend.calculateEMA(candles, 20);
    const ema50 = indicators.trend.calculateEMA(candles, 50);
    const vwap = indicators.trend.calculateVWAP(candles);
    const rvol = indicators.volume.calculateRelativeVolume(candles, 20);
    const atr = indicators.volatility.calculateATR(candles, 14);
    const rsi = indicators.momentum.calculateRSI(candles, 14);

    return { ema20, ema50, vwap, rvol, atr, rsi };
}

function evaluateInstitutionalHighWinRate(candles, i, data) {
    if (i < 55) return { type: "NONE" };

    const currCandle = candles[i];

    // 1. Time Window Filter: 09:25 to 11:15 AM or 14:00 to 15:00 PM (Avoid Midday Chop)
    const session = indicators.timeFactors.getTradingSessionWindow(currCandle.time || "");
    const minutes = session.totalMinutes;
    const isPrimeWindow = (minutes >= 565 && minutes <= 675) || (minutes >= 840 && minutes <= 900);
    if (!isPrimeWindow) return { type: "NONE" };

    const currEMA20 = data.ema20[i];
    const currEMA50 = data.ema50[i];
    const currVWAP = data.vwap[i];
    const currRVOL = data.rvol[i] || 1.0;
    const currATR = data.atr[i] || 15;
    const currRSI = data.rsi[i] || 50;

    if (!currEMA20 || !currEMA50 || !currVWAP) return { type: "NONE" };

    const isUptrend = currEMA20 > currEMA50 && currCandle.close > currVWAP;
    const isDowntrend = currEMA20 < currEMA50 && currCandle.close < currVWAP;

    // BUY Condition: Uptrend + Pullback to EMA20/VWAP + Bullish Candle + Volume > 1.2x + RSI 45-65
    const isBuyPullback = currCandle.low <= (currEMA20 + (0.3 * currATR)) && currCandle.close > currEMA20 && currCandle.close > currCandle.open;
    if (isUptrend && isBuyPullback && currRVOL >= 1.2 && currRSI >= 45 && currRSI <= 68) {
        const stopLoss = currCandle.low - (0.8 * currATR);
        const risk = currCandle.close - stopLoss;
        if (risk <= 0) return { type: "NONE" };

        const targetPrice = currCandle.close + (1.6 * risk); // 1:1.6 Risk Reward ratio

        return {
            type: "BUY",
            entryPrice: currCandle.close,
            stopLoss: Number(stopLoss.toFixed(2)),
            targetPrice: Number(targetPrice.toFixed(2))
        };
    }

    // SELL Condition: Downtrend + Pullback to EMA20/VWAP + Bearish Candle + Volume > 1.2x + RSI 32-55
    const isSellPullback = currCandle.high >= (currEMA20 - (0.3 * currATR)) && currCandle.close < currEMA20 && currCandle.close < currCandle.open;
    if (isDowntrend && isSellPullback && currRVOL >= 1.2 && currRSI <= 55 && currRSI >= 32) {
        const stopLoss = currCandle.high + (0.8 * currATR);
        const risk = stopLoss - currCandle.close;
        if (risk <= 0) return { type: "NONE" };

        const targetPrice = currCandle.close - (1.6 * risk); // 1:1.6 Risk Reward ratio

        return {
            type: "SELL",
            entryPrice: currCandle.close,
            stopLoss: Number(stopLoss.toFixed(2)),
            targetPrice: Number(targetPrice.toFixed(2))
        };
    }

    return { type: "NONE" };
}

module.exports = { prepareInstitutionalHighWinRateData, evaluateInstitutionalHighWinRate };
