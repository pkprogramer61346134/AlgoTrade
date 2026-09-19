const indicators = require('../indicators');
const { evaluateConsensusEngine } = require('./consensusEngine');

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
    const adx = indicators.trend.calculateADX(candles, 14);
    const vwap = indicators.trend.calculateVWAP(candles);
    const supertrend = indicators.trend.calculateSupertrend(candles, cfg.supertrendPeriod || 10, cfg.supertrendMultiplier || 3);
    const macd = indicators.momentum.calculateMACD(candles, 12, 26, 9);
    const bollinger = indicators.volatility.calculateBollingerBands(candles, 20, 2);
    const obv = indicators.volume.calculateOBV(candles);

    // Day ORB & Previous Day High/Low
    const dayORB = {};
    const dayHighLow = {};
    const dateList = [];
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (!c.date) continue;
        if (!dayORB[c.date]) dayORB[c.date] = { high: -Infinity, low: Infinity, count: 0 };
        if (dayORB[c.date].count < 3) {
            if (c.high > dayORB[c.date].high) dayORB[c.date].high = c.high;
            if (c.low < dayORB[c.date].low) dayORB[c.date].low = c.low;
            dayORB[c.date].count++;
        }

        if (!dayHighLow[c.date]) {
            dayHighLow[c.date] = { high: c.high, low: c.low };
            dateList.push(c.date);
        } else {
            if (c.high > dayHighLow[c.date].high) dayHighLow[c.date].high = c.high;
            if (c.low < dayHighLow[c.date].low) dayHighLow[c.date].low = c.low;
        }
    }

    const prevDayMap = {};
    for (let d = 1; d < dateList.length; d++) {
        const prevDate = dateList[d - 1];
        const currDate = dateList[d];
        prevDayMap[currDate] = dayHighLow[prevDate];
    }

    return { emaTrend, emaFast, emaSlow, rvol, rsi, atr, adx, vwap, supertrend, macd, bollinger, obv, dayORB, prevDayMap };
}

/**
 * Evaluates rules of a JSON strategy at candle index i
 */
function evaluateJSONStrategy(candles, i, strategyConfig, data, dailyTradeCounts, ignoreMaxTradesCap = false) {
    if (i < 3) return { type: "NONE" };

    const c = candles[i];
    if (!c.date) return { type: "NONE" };

    if (strategyConfig.id === "consensus_master_head" || strategyConfig.consensusThreshold) {
        return evaluateConsensusEngine(candles, i, strategyConfig, data, dailyTradeCounts, ignoreMaxTradesCap);
    }

    // Max Trades Cap (Skipped during pure strategy backtest)
    if (!ignoreMaxTradesCap) {
        const maxTrades = strategyConfig.maxTradesPerDay || 3;
        if ((dailyTradeCounts[c.date] || 0) >= maxTrades) return { type: "NONE" };
    }

    const orb = data.dayORB[c.date];
    const r = (data.rvol && data.rvol[i] !== null && data.rvol[i] !== undefined) ? Number(data.rvol[i]) : 1.0;
    const rsiVal = (data.rsi && data.rsi[i] !== null && data.rsi[i] !== undefined) ? Number(data.rsi[i]) : 50.0;
    const currATR = (data.atr && data.atr[i] !== null && data.atr[i] !== undefined) ? Number(data.atr[i]) : 15.0;
    const eTrend = (data.emaTrend && data.emaTrend[i] !== null) ? Number(data.emaTrend[i]) : null;
    const st = data.supertrend ? data.supertrend[i] : null;

    const pcrVal = data.livePCR !== undefined ? data.livePCR : (data.pcr && data.pcr[i] ? data.pcr[i] : (rsiVal > 50 ? 1.15 : 0.75));

    // BUY EVALUATION
    let buyMatch = true;
    const buyRules = strategyConfig.rules?.buy || [];
    let buyFailReasons = [];

    for (const rule of buyRules) {
        if (rule.target === "orbHigh") {
            if (!orb || orb.high === -Infinity || (c.high < orb.high && c.close < orb.high)) {
                buyMatch = false;
                buyFailReasons.push(`Price High ₹${c.high} < ORB High ₹${orb ? orb.high : 'N/A'}`);
            }
        } else if (rule.target === "ema200" || rule.target === "ema50" || (typeof rule.target === "string" && rule.target.startsWith("ema"))) {
            if (eTrend !== null && c.close <= eTrend) {
                buyMatch = false;
                buyFailReasons.push(`Price ₹${c.close} <= EMA Trend ₹${eTrend.toFixed(1)}`);
            }
        } else if (rule.field === "rvol") {
            if (r < rule.target) {
                buyMatch = false;
                buyFailReasons.push(`RVOL ${r.toFixed(2)}x < ${rule.target}x`);
            }
        } else if (rule.field === "rsi") {
            if (rsiVal <= rule.target) {
                buyMatch = false;
                buyFailReasons.push(`RSI ${rsiVal.toFixed(1)} <= ${rule.target}`);
            }
        } else if (rule.field === "supertrendDirection") {
            if (!st || st.direction !== rule.target) {
                buyMatch = false;
                buyFailReasons.push(`Supertrend Direction is ${st ? st.direction : 'N/A'} (expected ${rule.target})`);
            }
        } else if (rule.field === "pcr") {
            if (pcrVal < rule.target) {
                buyMatch = false;
                buyFailReasons.push(`PCR ${pcrVal.toFixed(2)} < ${rule.target}`);
            }
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

            const reasoning = `🚀 BUY SIGNAL TRIGGERED: Price ₹${c.close} broke above ORB High (₹${orb?.high}) with RVOL ${r.toFixed(2)}x & Bullish PCR (${pcrVal.toFixed(2)}). StopLoss: ₹${sl.toFixed(2)}, Target: ₹${tp.toFixed(2)}.`;
            return {
                type: "BUY",
                entryPrice: c.close,
                stopLoss: Number(sl.toFixed(2)),
                targetPrice: Number(tp.toFixed(2)),
                reasoning: reasoning,
                indicators: { rvol: Number(r.toFixed(2)), rsi: Number(rsiVal.toFixed(1)), orbHigh: orb?.high, orbLow: orb?.low, pcr: Number(pcrVal.toFixed(2)) }
            };
        }
    }

    // SELL EVALUATION
    let sellMatch = true;
    const sellRules = strategyConfig.rules?.sell || [];
    let sellFailReasons = [];

    for (const rule of sellRules) {
        if (rule.target === "orbLow") {
            if (!orb || orb.low === Infinity || (c.low > orb.low && c.close > orb.low)) {
                sellMatch = false;
                sellFailReasons.push(`Price Low ₹${c.low} > ORB Low ₹${orb ? orb.low : 'N/A'}`);
            }
        } else if (rule.target === "ema200" || rule.target === "ema50" || (typeof rule.target === "string" && rule.target.startsWith("ema"))) {
            if (eTrend !== null && c.close >= eTrend) {
                sellMatch = false;
                sellFailReasons.push(`Price ₹${c.close} >= EMA Trend ₹${eTrend.toFixed(1)}`);
            }
        } else if (rule.field === "rvol") {
            if (r < rule.target) {
                sellMatch = false;
                sellFailReasons.push(`RVOL ${r.toFixed(2)}x < ${rule.target}x`);
            }
        } else if (rule.field === "rsi") {
            if (rsiVal >= rule.target) {
                sellMatch = false;
                sellFailReasons.push(`RSI ${rsiVal.toFixed(1)} >= ${rule.target}`);
            }
        } else if (rule.field === "supertrendDirection") {
            if (!st || st.direction !== rule.target) {
                sellMatch = false;
                sellFailReasons.push(`Supertrend Direction is ${st ? st.direction : 'N/A'} (expected ${rule.target})`);
            }
        } else if (rule.field === "pcr") {
            if (pcrVal > rule.target) {
                sellMatch = false;
                sellFailReasons.push(`PCR ${pcrVal.toFixed(2)} > ${rule.target}`);
            }
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

            const reasoning = `🔻 SELL SIGNAL TRIGGERED: Price ₹${c.close} broke below ORB Low (₹${orb?.low}) with RVOL ${r.toFixed(2)}x & Bearish PCR (${pcrVal.toFixed(2)}). StopLoss: ₹${sl.toFixed(2)}, Target: ₹${tp.toFixed(2)}.`;
            return {
                type: "SELL",
                entryPrice: c.close,
                stopLoss: Number(sl.toFixed(2)),
                targetPrice: Number(tp.toFixed(2)),
                reasoning: reasoning,
                indicators: { rvol: Number(r.toFixed(2)), rsi: Number(rsiVal.toFixed(1)), orbHigh: orb?.high, orbLow: orb?.low, pcr: Number(pcrVal.toFixed(2)) }
            };
        }
    }

    const flatReason = `ℹ️ FLAT (WAITING): Price ₹${c.close} is inside Morning ORB Range (Low ₹${orb?.low || 'N/A'} - High ₹${orb?.high || 'N/A'}). RVOL: ${r.toFixed(2)}x, PCR: ${pcrVal.toFixed(2)}. Waiting for breakout.`;
    return {
        type: "NONE",
        reasoning: flatReason,
        indicators: { rvol: Number(r.toFixed(2)), rsi: Number(rsiVal.toFixed(1)), orbHigh: orb?.high, orbLow: orb?.low, pcr: Number(pcrVal.toFixed(2)) }
    };
}

module.exports = {
    prepareJSONStrategyData,
    evaluateJSONStrategy
};
