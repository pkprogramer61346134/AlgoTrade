const indicators = require('../indicators');

/**
 * Precalculates required indicators for a JSON strategy config across full candle array
 */
function prepareJSONStrategyData(candles, strategyConfig) {
    const cfg = strategyConfig.indicators || {};

    const emaTrend = cfg.emaTrendPeriod ? indicators.trend.calculateEMA(candles, cfg.emaTrendPeriod) : null;
    const emaFast = cfg.emaFastPeriod ? indicators.trend.calculateEMA(candles, cfg.emaFastPeriod) : null;
    const emaSlow = cfg.emaSlowPeriod ? indicators.trend.calculateEMA(candles, cfg.emaSlowPeriod) : null;
    const rvol = indicators.volume.calculateRelativeVolume(candles, 20);
    const rsi = cfg.rsiPeriod ? indicators.momentum.calculateRSI(candles, cfg.rsiPeriod) : null;
    const atr = indicators.volatility.calculateATR(candles, 14);
    const supertrend = cfg.supertrendPeriod ? indicators.trend.calculateSupertrend(candles, cfg.supertrendPeriod, cfg.supertrendMultiplier || 3) : null;

    // Day ORB
    const dayORB = {};
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (!c.date) continue;
        if (!dayORB[c.date]) dayORB[c.date] = { high: -Infinity, low: Infinity, count: 0 };
        if (dayORB[c.date].count < 3) {
            if (c.high > dayORB[c.date].high) dayORB[c.date].high = c.high;
            if (c.low < dayORB[c.date].low) dayORB[c.date].low = c.low;
            dayORB[c.date].count++;
        }
    }

    return { emaTrend, emaFast, emaSlow, rvol, rsi, atr, supertrend, dayORB };
}

/**
 * Evaluates rules of a JSON strategy at candle index i
 */
function evaluateJSONStrategy(candles, i, strategyConfig, data, dailyTradeCounts) {
    if (i < 30) return { type: "NONE" };

    const c = candles[i];
    if (!c.date) return { type: "NONE" };

    // Max Trades Cap
    const maxTrades = strategyConfig.maxTradesPerDay || 3;
    if ((dailyTradeCounts[c.date] || 0) >= maxTrades) return { type: "NONE" };

    const orb = data.dayORB[c.date];
    const r = data.rvol[i] || 1.0;
    const rsiVal = data.rsi ? data.rsi[i] : 50;
    const currATR = data.atr ? data.atr[i] : 15;
    const eTrend = data.emaTrend ? data.emaTrend[i] : null;
    const st = data.supertrend ? data.supertrend[i] : null;

    const pcrVal = data.livePCR !== undefined ? data.livePCR : (data.pcr ? data.pcr[i] : (rsiVal > 50 ? 1.15 : 0.75));

    // BUY EVALUATION
    let buyMatch = true;
    const buyRules = strategyConfig.rules?.buy || [];
    for (const rule of buyRules) {
        if (rule.target === "orbHigh") {
            if (!orb || orb.high === -Infinity || c.close <= orb.high) buyMatch = false;
        } else if (rule.target === "ema200") {
            if (!eTrend || c.close <= eTrend) buyMatch = false;
        } else if (rule.field === "rvol") {
            if (r < rule.target) buyMatch = false;
        } else if (rule.field === "rsi") {
            if (rsiVal <= rule.target) buyMatch = false;
        } else if (rule.field === "supertrendDirection") {
            if (!st || st.direction !== rule.target) buyMatch = false;
        } else if (rule.field === "pcr") {
            if (pcrVal < rule.target) buyMatch = false;
        }
    }

    if (buyMatch && buyRules.length > 0) {
        let sl = c.close - (1.2 * currATR);
        if (strategyConfig.stopLoss?.type === "ORB_LEVEL" && orb && orb.low !== Infinity) {
            sl = orb.low;
        }
        const risk = c.close - sl;
        if (risk > 0) {
            const rrMultiplier = strategyConfig.target?.multiplier || strategyConfig.riskRewardRatio || 1.5;
            const tp = c.close + (rrMultiplier * risk);
            dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;

            return {
                type: "BUY",
                entryPrice: c.close,
                stopLoss: Number(sl.toFixed(2)),
                targetPrice: Number(tp.toFixed(2))
            };
        }
    }

    // SELL EVALUATION
    let sellMatch = true;
    const sellRules = strategyConfig.rules?.sell || [];
    for (const rule of sellRules) {
        if (rule.target === "orbLow") {
            if (!orb || orb.low === Infinity || c.close >= orb.low) sellMatch = false;
        } else if (rule.target === "ema200") {
            if (!eTrend || c.close >= eTrend) sellMatch = false;
        } else if (rule.field === "rvol") {
            if (r < rule.target) sellMatch = false;
        } else if (rule.field === "rsi") {
            if (rsiVal >= rule.target) sellMatch = false;
        } else if (rule.field === "supertrendDirection") {
            if (!st || st.direction !== rule.target) sellMatch = false;
        } else if (rule.field === "pcr") {
            if (pcrVal > rule.target) sellMatch = false;
        }
    }

    if (sellMatch && sellRules.length > 0) {
        let sl = c.close + (1.2 * currATR);
        if (strategyConfig.stopLoss?.type === "ORB_LEVEL" && orb && orb.high !== -Infinity) {
            sl = orb.high;
        }
        const risk = sl - c.close;
        if (risk > 0) {
            const rrMultiplier = strategyConfig.target?.multiplier || strategyConfig.riskRewardRatio || 1.5;
            const tp = c.close - (rrMultiplier * risk);
            dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;

            return {
                type: "SELL",
                entryPrice: c.close,
                stopLoss: Number(sl.toFixed(2)),
                targetPrice: Number(tp.toFixed(2))
            };
        }
    }

    return { type: "NONE" };
}

module.exports = {
    prepareJSONStrategyData,
    evaluateJSONStrategy
};
