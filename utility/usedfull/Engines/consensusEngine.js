/**
 * Clean & Lightweight Multi-Strategy Consensus Engine with Auto-Warmup
 * Location: C:\AlgoTrade\utility\usedfull\Engines\consensusEngine.js
 * 
 * Features:
 * - Pure Input -> Output Evaluation: Accepts Candle Data -> Returns Strategy Output Signal.
 * - Auto-Warmup via cached-historical-data.js: If input candles < 200, automatically fetches
 *   prior 200/400 candles up to the input candle's date and time for 100% accurate indicators!
 * - Output fields: { consensus, type, entry, sl, tr, confidence, strategyId, strategyName, triggeredSignals, warmupCandleCount }
 */

const fs = require('fs');
const path = require('path');
const { getCachedCandles } = require('../cached-historical-data');

// Lazy-require masterSL engine for active trade alignment checking
let masterSLInstance = null;
function getMasterSL() {
    if (!masterSLInstance) {
        try {
            masterSLInstance = require('../../../server/masterSL/masterSL');
        } catch (e) {
            try {
                masterSLInstance = require('../../server/masterSL/masterSL');
            } catch (e2) {}
        }
    }
    return masterSLInstance;
}

// Fixed paths inside C:\AlgoTrade\utility\usedfull\Engines
const INDICATORS_PATH = path.join(__dirname, 'tools/indicators');
const CONFIG_PATH = path.join(__dirname, 'consensus_master_head.json');

let pendingSignalTracker = null;
let confidenceTimeTracker = {
    lastSignalType: "NO_SIGNAL",
    firstSeenMs: 0,
    lastIntervalStep: 0,
    rampBonus: 0,
    decayPenalty: 0
};
let indicators;
try {
    indicators = require(INDICATORS_PATH);
} catch (e) {
    try {
        indicators = require('./tools/indicators');
    } catch (e2) {
        try {
            indicators = require('../../../indicators');
        } catch (e3) {
            indicators = require('../../indicators');
        }
    }
}

/**
 * Auto-loads strategy JSON configuration from consensus_master_head.json
 */
function loadStrategyConfig(configName = "consensus_master_head.json") {
    try {
        const primaryPath = path.join(__dirname, configName);
        if (fs.existsSync(primaryPath)) {
            return JSON.parse(fs.readFileSync(primaryPath, 'utf8'));
        }
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) {
        console.warn(`⚠️ [CONSENSUS ENGINE] Failed to load strategy config: ${e.message}`);
    }
    return {};
}

const STRATEGIES_DIR = path.join(__dirname, 'strategies');

/**
 * Resolves and loads all active strategies from strategy group JSON files
 * listed in config.strategies (or config.strategyFiles) with `true` toggle flags.
 */
function resolveAllStrategies(config = {}) {
    const loadedStrategies = [];

    // 1. Check if config.strategies or config.strategyFiles is an object mapping strategy files -> boolean OR { enabled, minVotes }
    const fileMap = config.strategyFiles || (config.strategies && typeof config.strategies === 'object' && !Array.isArray(config.strategies) ? config.strategies : null);

    if (fileMap && typeof fileMap === 'object') {
        for (const [fileName, val] of Object.entries(fileMap)) {
            const isEnabled = val === true || (typeof val === 'object' && val !== null && val.enabled === true);
            if (!isEnabled) continue;

            const groupMinVotes = (typeof val === 'object' && val !== null && val.minVotes !== undefined) ? Number(val.minVotes) : undefined;
            const cleanFileName = fileName.replace(/^(\.\/|strategies[/\\])+/i, '');
            const filePath = path.isAbsolute(fileName) ? fileName : path.join(STRATEGIES_DIR, cleanFileName);

            if (fs.existsSync(filePath)) {
                try {
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    const list = Array.isArray(content) ? content : (content.strategies || (content.id ? [content] : []));

                    for (const s of list) {
                        if (s && s.enabled !== false) {
                            if (groupMinVotes !== undefined && s.minVotes === undefined) {
                                s.groupMinVotes = groupMinVotes;
                            }
                            loadedStrategies.push(s);
                        }
                    }
                } catch (err) {
                    console.error(`❌ [CONSENSUS ENGINE] Failed to parse strategy file ${fileName}: ${err.message}`);
                }
            } else {
                console.warn(`⚠️ [CONSENSUS ENGINE] Strategy group file not found: ${filePath}`);
            }
        }
    }

    // 2. Fallback / Array support if config.strategies is an array
    if (Array.isArray(config.strategies)) {
        for (const item of config.strategies) {
            if (typeof item === 'string' && item.endsWith('.json')) {
                const cleanFileName = item.replace(/^(\.\/|strategies[/\\])+/i, '');
                const filePath = path.isAbsolute(item) ? item : path.join(STRATEGIES_DIR, cleanFileName);
                if (fs.existsSync(filePath)) {
                    try {
                        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        const list = Array.isArray(content) ? content : (content.strategies || []);
                        for (const s of list) {
                            if (s && s.enabled !== false) loadedStrategies.push(s);
                        }
                    } catch (e) {
                        console.error(`❌ [CONSENSUS ENGINE] Error loading strategy file ${item}: ${e.message}`);
                    }
                }
            } else if (item && typeof item === 'object') {
                if (item.enabled !== false) {
                    loadedStrategies.push(item);
                }
            }
        }
    }

    return loadedStrategies;
}

/**
 * Compute technical indicators across candle dataset
 */
function computeIndicators(candles, cfg = {}) {
    if (!candles || !Array.isArray(candles) || candles.length === 0) return {};

    const vwap = indicators.trend.calculateVWAP(candles);
    const supertrend = indicators.trend.calculateSupertrend(candles, cfg.supertrendPeriod || 10, cfg.supertrendMultiplier || 3);
    const rvol = indicators.volume.calculateRelativeVolume(candles, cfg.rvolPeriod || 20);
    const rsi = indicators.momentum.calculateRSI(candles, cfg.rsiPeriod || 14);
    const adx = indicators.trend.calculateADX(candles, cfg.adxPeriod || 14);
    const atr = indicators.volatility.calculateATR(candles, cfg.atrPeriod || 14);
    const ema10 = indicators.trend.calculateEMA(candles, 10);
    const emaFast = indicators.trend.calculateEMA(candles, cfg.emaFastPeriod || 20);
    const emaSlow = indicators.trend.calculateEMA(candles, cfg.emaSlowPeriod || 50);
    const macd = indicators.momentum.calculateMACD ? indicators.momentum.calculateMACD(candles, 12, 26, 9) : null;
    const bollinger = indicators.volatility.calculateBollingerBands ? indicators.volatility.calculateBollingerBands(candles, 20, 2) : null;

    const donchian = [];
    if (candles && Array.isArray(candles)) {
        const period = cfg.donchianPeriod || 20;
        for (let idx = 0; idx < candles.length; idx++) {
            if (idx < period) { donchian.push(null); continue; }
            const slice = candles.slice(idx - period, idx);
            const upper = Math.max(...slice.map(c => c.high || c.candleHigh || c.close));
            const lower = Math.min(...slice.map(c => c.low || c.candleLow || c.close));
            donchian.push({ upper, lower });
        }
    }

    const orbMap = {};
    const prevDayMap = {};
    if (candles && candles.length > 0) {
        const candlesByDate = {};
        for (const c of candles) {
            const d = c.date || 'DEFAULT';
            if (!candlesByDate[d]) candlesByDate[d] = [];
            candlesByDate[d].push(c);
        }
        const fnORB = indicators.getOpeningRange || (indicators.marketContext && indicators.marketContext.getOpeningRange);
        for (const [d, dateCandles] of Object.entries(candlesByDate)) {
            if (fnORB) {
                const res = fnORB(dateCandles, 15);
                orbMap[d] = { high: res ? res.orbHigh : null, low: res ? res.orbLow : null };
            }
        }
        const dates = Object.keys(candlesByDate);
        for (let dIdx = 1; dIdx < dates.length; dIdx++) {
            const prevDate = dates[dIdx - 1];
            const currentDate = dates[dIdx];
            const prevCandles = candlesByDate[prevDate];
            if (prevCandles && prevCandles.length > 0) {
                const high = Math.max(...prevCandles.map(c => c.high || c.candleHigh || c.close));
                const low = Math.min(...prevCandles.map(c => c.low || c.candleLow || c.close));
                prevDayMap[currentDate] = { pdh: high, pdl: low };
            }
        }
    }

    const fnWicks = indicators.analyzeWicks || (indicators.priceAction && indicators.priceAction.analyzeWicks);
    const wicks = (candles && Array.isArray(candles)) ? candles.map(c => fnWicks ? fnWicks(c) : null) : [];

    return { vwap, supertrend, rvol, rsi, adx, atr, ema10, emaFast, emaSlow, macd, bollinger, donchian, orb: orbMap, prevDay: prevDayMap, wicks };
}

/**
 * Evaluate a single strategy against a candle
 */
function evaluateSingleStrategy(c, i, candles, strat, computed) {
    if (!c) return null;
    const spotPrice = Number(c.close || c.candleClose || c.price || c.ltp || c.liveLtp || 0);
    if (!spotPrice || isNaN(spotPrice) || spotPrice <= 0) return null;
    const vwapVal = computed.vwap ? computed.vwap[i] : null;
    const stObj = computed.supertrend ? computed.supertrend[i] : null;
    const rvolVal = computed.rvol ? computed.rvol[i] : null;
    const rsiVal = computed.rsi ? computed.rsi[i] : null;
    const adxObj = computed.adx ? computed.adx[i] : null;
    const adxVal = (adxObj && adxObj.adx !== undefined) ? adxObj.adx : null;
    const rawAtr = computed.atr ? computed.atr[i] : null;
    const atrVal = (rawAtr && typeof rawAtr === 'object' && rawAtr.atr !== undefined) ? Number(rawAtr.atr) : (typeof rawAtr === 'number' && !isNaN(rawAtr) ? rawAtr : null);

    const candleHigh = c.high || c.candleHigh || spotPrice;
    const candleLow = c.low || c.candleLow || spotPrice;
    const candleRange = Math.abs(candleHigh - candleLow);
    const safeAtr = (atrVal !== null && atrVal > 0) ? atrVal : Math.max(0.1, candleRange);

    const e10 = computed.ema10 ? computed.ema10[i] : null;
    const eFast = computed.emaFast ? computed.emaFast[i] : null;
    const eSlow = computed.emaSlow ? computed.emaSlow[i] : null;
    const orbObj = computed.orb ? (computed.orb[c.date] || computed.orb['DEFAULT']) : null;
    const prevDayObj = computed.prevDay ? (computed.prevDay[c.date] || null) : null;
    const wickObj = computed.wicks ? computed.wicks[i] : null;
    const macdObj = computed.macd ? computed.macd[i] : null;
    const bbObj = computed.bollinger ? computed.bollinger[i] : null;
    const donchianObj = computed.donchian ? computed.donchian[i] : null;

    const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
    const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");

    const isLowerWickRej = wickObj && (wickObj.rejection === "BUYING_REJECTION" || wickObj.lowerWickRatio >= 40);
    const isUpperWickRej = wickObj && (wickObj.rejection === "SELLING_REJECTION" || wickObj.upperWickRatio >= 40);

    const cfgInds = strat.indicators || {};
    const minRvol = cfgInds.rvolMin || 1.20;
    const minAdx = cfgInds.adxMin || 18;
    const atrMult = cfgInds.atrMultiplier || 1.8;

    const effectiveRvol = (rvolVal !== null && rvolVal <= 1.15 && ((adxVal !== null && adxVal >= 18) || (rsiVal !== null && Math.abs(rsiVal - 50) >= 3))) ? 1.50 : rvolVal;

    let signalType = "NONE";

    if (strat.rules) {
        let buyMatch = Array.isArray(strat.rules.buy) && strat.rules.buy.length > 0;
        let sellMatch = Array.isArray(strat.rules.sell) && strat.rules.sell.length > 0;

        if (buyMatch) {
            for (const r of strat.rules.buy) {
                if (r.target === "supertrend" && r.condition === "bullish" && !isStBull) buyMatch = false;
                if (r.target === "vwap" && r.condition === "above" && (vwapVal === null || spotPrice <= vwapVal)) buyMatch = false;
                if (r.target === "rvol" && r.condition === "gte" && (effectiveRvol === null || effectiveRvol < (r.value || minRvol))) buyMatch = false;
                if (r.target === "rsi" && r.condition === "gte" && (rsiVal === null || rsiVal < (r.value || 50))) buyMatch = false;
                if (r.target === "adx" && r.condition === "gte" && (adxVal === null || adxVal < (r.value || minAdx))) buyMatch = false;
                if (r.target === "orb" && r.condition === "aboveHigh" && (!orbObj || orbObj.high === null || spotPrice <= orbObj.high)) buyMatch = false;
                if (r.target === "ema" && r.condition === "goldenCross" && (eFast === null || eSlow === null || eFast <= eSlow)) buyMatch = false;
                if (r.target === "tripleEMA" && r.condition === "bullishStack" && (e10 === null || eFast === null || eSlow === null || e10 <= eFast || eFast <= eSlow)) buyMatch = false;
                if (r.target === "priceAction" && r.condition === "lowerWickRejection" && !isLowerWickRej) buyMatch = false;
                if (r.target === "macd" && r.condition === "bullishCross" && (!macdObj || macdObj.macd === null || macdObj.signal === null || macdObj.macd <= macdObj.signal)) buyMatch = false;
                if (r.target === "donchian" && r.condition === "upperBreak" && (!donchianObj || donchianObj.upper === null || spotPrice <= donchianObj.upper)) buyMatch = false;
                if (r.target === "atrExpansion" && r.condition === "rangeSpike" && candleRange < (safeAtr * atrMult)) buyMatch = false;
                if (r.target === "prevDay" && r.condition === "abovePDH" && (!prevDayObj || !prevDayObj.pdh || spotPrice <= prevDayObj.pdh)) buyMatch = false;
                if (r.target === "bollinger" && r.condition === "upperBandBreak" && (!bbObj || !bbObj.upper || spotPrice <= bbObj.upper)) buyMatch = false;
            }
        }

        if (sellMatch) {
            for (const r of strat.rules.sell) {
                if (r.target === "supertrend" && r.condition === "bearish" && !isStBear) sellMatch = false;
                if (r.target === "vwap" && r.condition === "below" && (vwapVal === null || spotPrice >= vwapVal)) sellMatch = false;
                if (r.target === "rvol" && r.condition === "gte" && (effectiveRvol === null || effectiveRvol < (r.value || minRvol))) sellMatch = false;
                if (r.target === "rsi" && r.condition === "lte" && (rsiVal === null || rsiVal > (r.value || 50))) sellMatch = false;
                if (r.target === "adx" && r.condition === "gte" && (adxVal === null || adxVal < (r.value || minAdx))) sellMatch = false;
                if (r.target === "orb" && r.condition === "belowLow" && (!orbObj || orbObj.low === null || spotPrice >= orbObj.low)) sellMatch = false;
                if (r.target === "ema" && r.condition === "deathCross" && (eFast === null || eSlow === null || eFast >= eSlow)) sellMatch = false;
                if (r.target === "tripleEMA" && r.condition === "bearishStack" && (e10 === null || eFast === null || eSlow === null || e10 >= eFast || eFast >= eSlow)) sellMatch = false;
                if (r.target === "priceAction" && r.condition === "upperWickRejection" && !isUpperWickRej) sellMatch = false;
                if (r.target === "macd" && r.condition === "bearishCross" && (!macdObj || macdObj.macd === null || macdObj.signal === null || macdObj.macd >= macdObj.signal)) sellMatch = false;
                if (r.target === "donchian" && r.condition === "lowerBreak" && (!donchianObj || donchianObj.lower === null || spotPrice >= donchianObj.lower)) sellMatch = false;
                if (r.target === "atrExpansion" && r.condition === "rangeSpike" && candleRange < (safeAtr * atrMult)) sellMatch = false;
                if (r.target === "prevDay" && r.condition === "belowPDL" && (!prevDayObj || !prevDayObj.pdl || spotPrice >= prevDayObj.pdl)) sellMatch = false;
                if (r.target === "bollinger" && r.condition === "lowerBandBreak" && (!bbObj || !bbObj.lower || spotPrice >= bbObj.lower)) sellMatch = false;
            }
        }

        if (buyMatch) signalType = "BUY";
        else if (sellMatch) signalType = "SELL";
    }

    if (signalType !== "NONE") {
        const dynamicSLPoints = Math.max(15.0, Math.min(35.0, safeAtr * 1.5));
        let sl = signalType === "BUY" ? (spotPrice - dynamicSLPoints) : (spotPrice + dynamicSLPoints);
        const risk = Math.abs(spotPrice - sl);
        const rrMultiplier = strat.riskRewardRatio || 2.0;
        const dynamicTRPoints = risk * rrMultiplier;
        let tp = signalType === "BUY" ? (spotPrice + dynamicTRPoints) : (spotPrice - dynamicTRPoints);

        return {
            strategyId: strat.id,
            strategyName: strat.name,
            type: signalType,
            entry: Number(spotPrice.toFixed(2)),
            sl: Number(sl.toFixed(2)),
            tr: Number(tp.toFixed(2)),
            confidence: strat.winrate || "70.0%",
            reason: `🟢 All Rules Met (${signalType})`
        };
    }

    return null;
}

/**
 * Detailed Reason Helper: Returns exact indicator values & reasons why strategy did or didn't vote
 */
function getStrategyFailureReason(c, i, candles, strat, computed) {
    const spotPrice = c.close || c.candleClose || c.price;
    const vwapVal = computed.vwap ? computed.vwap[i] : null;
    const stObj = computed.supertrend ? computed.supertrend[i] : null;
    const rvolVal = (computed.rvol && computed.rvol[i] !== null) ? computed.rvol[i] : 1.0;
    const rsiVal = (computed.rsi && computed.rsi[i] !== null) ? computed.rsi[i] : null;
    const adxObj = computed.adx ? computed.adx[i] : null;
    const adxVal = (adxObj && adxObj.adx !== null && adxObj.adx !== undefined) ? adxObj.adx : null;

    const e10 = computed.ema10 ? computed.ema10[i] : null;
    const eFast = computed.emaFast ? computed.emaFast[i] : null;
    const eSlow = computed.emaSlow ? computed.emaSlow[i] : null;
    const orbObj = computed.orb ? (computed.orb[c.date] || computed.orb['DEFAULT']) : null;
    const prevDayObj = computed.prevDay ? (computed.prevDay[c.date] || null) : null;
    const macdObj = computed.macd ? computed.macd[i] : null;
    const donchianObj = computed.donchian ? computed.donchian[i] : null;

    const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
    const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");

    const cfgInds = strat.indicators || {};
    const minRvol = cfgInds.rvolMin || 1.20;
    const minAdx = cfgInds.adxMin || 18;

    const buyReasons = [];
    const sellReasons = [];

    if (strat.rules && Array.isArray(strat.rules.buy)) {
        for (const r of strat.rules.buy) {
            if (r.target === "supertrend" && !isStBull) buyReasons.push("Supertrend Bearish/Neutral");
            if (r.target === "vwap" && (vwapVal === null || spotPrice <= vwapVal)) buyReasons.push(`Price Below VWAP (₹${spotPrice.toFixed(1)} <= ₹${vwapVal ? vwapVal.toFixed(1) : 'N/A'})`);
            if (r.target === "rsi" && (rsiVal === null || rsiVal < (r.value || 50))) buyReasons.push(`RSI Low (${rsiVal !== null ? rsiVal.toFixed(1) : 'N/A'} < ${r.value || 50})`);
            if (r.target === "rvol" && (rvolVal || 1.0) < (r.value || minRvol)) buyReasons.push(`RVOL Low (${(rvolVal || 1.0).toFixed(2)} < ${r.value || minRvol})`);
            if (r.target === "adx" && (adxVal === null || adxVal < (r.value || minAdx))) buyReasons.push(`ADX Weak (${adxVal !== null ? adxVal.toFixed(1) : 'N/A'} < ${r.value || minAdx})`);
            if (r.target === "orb" && (!orbObj || !orbObj.high || spotPrice <= orbObj.high)) buyReasons.push(`Below ORB High (₹${orbObj?.high ? orbObj.high.toFixed(1) : 'N/A'})`);
            if (r.target === "tripleEMA" && (e10 === null || eFast === null || eSlow === null || e10 <= eFast || eFast <= eSlow)) buyReasons.push("EMA 10/20/50 Not Bullish");
            if (r.target === "ema" && (eFast === null || eSlow === null || eFast <= eSlow)) buyReasons.push("EMA Fast <= Slow");
            if (r.target === "macd" && (!macdObj || !macdObj.macd || !macdObj.signal || macdObj.macd <= macdObj.signal)) buyReasons.push("MACD Below Signal");
            if (r.target === "donchian" && (!donchianObj || !donchianObj.upper || spotPrice <= donchianObj.upper)) buyReasons.push("Below Donchian Upper");
            if (r.target === "prevDay" && (!prevDayObj || !prevDayObj.pdh || spotPrice <= prevDayObj.pdh)) buyReasons.push("Below Previous Day High");
        }
    }

    if (strat.rules && Array.isArray(strat.rules.sell)) {
        for (const r of strat.rules.sell) {
            if (r.target === "supertrend" && !isStBear) sellReasons.push("Supertrend Bullish/Neutral");
            if (r.target === "vwap" && (vwapVal === null || spotPrice >= vwapVal)) sellReasons.push(`Price Above VWAP (₹${spotPrice.toFixed(1)} >= ₹${vwapVal ? vwapVal.toFixed(1) : 'N/A'})`);
            if (r.target === "rsi" && (rsiVal === null || rsiVal > (r.value || 50))) sellReasons.push(`RSI High (${rsiVal !== null ? rsiVal.toFixed(1) : 'N/A'} > ${r.value || 50})`);
            if (r.target === "rvol" && (rvolVal || 1.0) < (r.value || minRvol)) sellReasons.push(`RVOL Low (${(rvolVal || 1.0).toFixed(2)} < ${r.value || minRvol})`);
            if (r.target === "adx" && (adxVal === null || adxVal < (r.value || minAdx))) sellReasons.push(`ADX Weak (${adxVal !== null ? adxVal.toFixed(1) : 'N/A'} < ${r.value || minAdx})`);
            if (r.target === "orb" && (!orbObj || !orbObj.low || spotPrice >= orbObj.low)) sellReasons.push(`Above ORB Low (₹${orbObj?.low ? orbObj.low.toFixed(1) : 'N/A'})`);
            if (r.target === "tripleEMA" && (e10 === null || eFast === null || eSlow === null || e10 >= eFast || eFast >= eSlow)) sellReasons.push("EMA 10/20/50 Not Bearish");
            if (r.target === "ema" && (eFast === null || eSlow === null || eFast >= eSlow)) sellReasons.push("EMA Fast >= Slow");
            if (r.target === "macd" && (!macdObj || !macdObj.macd || !macdObj.signal || macdObj.macd >= macdObj.signal)) sellReasons.push("MACD Above Signal");
            if (r.target === "donchian" && (!donchianObj || !donchianObj.lower || spotPrice >= donchianObj.lower)) sellReasons.push("Above Donchian Lower");
            if (r.target === "prevDay" && (!prevDayObj || !prevDayObj.pdl || spotPrice >= prevDayObj.pdl)) sellReasons.push("Above Previous Day Low");
        }
    }

    const isBearishTrend = (isStBear || (vwapVal && spotPrice < vwapVal));
    const targetReasons = isBearishTrend && sellReasons.length > 0 ? sellReasons : buyReasons;

    if (targetReasons.length > 0) {
        return targetReasons.slice(0, 2).join("; ");
    }

    return "Conditions Not Satisfied";
}

/**
 * Evaluate real-time directional bias (BULLISH / BEARISH / NEUTRAL) for a strategy
 */
function getStrategyLiveBias(c, i, candles, strat, computed) {
    const spotPrice = c.close || c.candleClose || c.price;
    const vwapVal = computed.vwap ? computed.vwap[i] : null;
    const stObj = computed.supertrend ? computed.supertrend[i] : null;
    const rsiVal = computed.rsi ? computed.rsi[i] : 50.0;
    const e10 = computed.ema10 ? computed.ema10[i] : null;
    const eFast = computed.emaFast ? computed.emaFast[i] : null;
    const eSlow = computed.emaSlow ? computed.emaSlow[i] : null;
    const orbObj = computed.orb ? (computed.orb[c.date] || computed.orb['DEFAULT']) : null;
    const prevDayObj = computed.prevDay ? (computed.prevDay[c.date] || null) : null;
    const wickObj = computed.wicks ? computed.wicks[i] : null;
    const macdObj = computed.macd ? computed.macd[i] : null;
    const donchianObj = computed.donchian ? computed.donchian[i] : null;

    const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
    const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");

    const id = (strat.id || "").toLowerCase();
    const name = (strat.name || "").toLowerCase();

    if (id.includes("supertrend") || name.includes("supertrend")) {
        if (isStBull && vwapVal && spotPrice > vwapVal) return "BULLISH";
        if (isStBear && vwapVal && spotPrice < vwapVal) return "BEARISH";
    } else if (id.includes("orb") || name.includes("orb")) {
        if (orbObj && orbObj.high && spotPrice > orbObj.high) return "BULLISH";
        if (orbObj && orbObj.low && spotPrice < orbObj.low) return "BEARISH";
    } else if (id.includes("ema_rsi") || name.includes("ema")) {
        if (eFast && eSlow && eFast > eSlow && rsiVal >= 50) return "BULLISH";
        if (eFast && eSlow && eFast < eSlow && rsiVal <= 50) return "BEARISH";
    } else if (id.includes("liquidity") || name.includes("wick")) {
        if (wickObj?.rejection === "BUYING_REJECTION" || (wickObj?.lowerWickRatio || 0) >= 30) return "BULLISH";
        if (wickObj?.rejection === "SELLING_REJECTION" || (wickObj?.upperWickRatio || 0) >= 30) return "BEARISH";
    } else if (id.includes("triple_confluence") || name.includes("confluence")) {
        if (isStBull && eFast && eSlow && eFast > eSlow) return "BULLISH";
        if (isStBear && eFast && eSlow && eFast < eSlow) return "BEARISH";
    } else if (id.includes("triple_ema") || name.includes("stacked")) {
        if (e10 && eFast && eSlow && e10 > eFast && eFast > eSlow) return "BULLISH";
        if (e10 && eFast && eSlow && e10 < eFast && eFast < eSlow) return "BEARISH";
    } else if (id.includes("macd") || name.includes("macd")) {
        if (isStBull && macdObj?.macd && macdObj.macd > (macdObj.signal || 0)) return "BULLISH";
        if (isStBear && macdObj?.macd && macdObj.macd < (macdObj.signal || 0)) return "BEARISH";
    } else if (id.includes("donchian") || name.includes("donchian")) {
        if (donchianObj && donchianObj.upper && spotPrice >= donchianObj.upper) return "BULLISH";
        if (donchianObj && donchianObj.lower && spotPrice <= donchianObj.lower) return "BEARISH";
    } else if (id.includes("prev_day") || name.includes("previous day")) {
        if (prevDayObj && prevDayObj.pdh && spotPrice > prevDayObj.pdh) return "BULLISH";
        if (prevDayObj && prevDayObj.pdl && spotPrice < prevDayObj.pdl) return "BEARISH";
    }

    // General indicator fallback evaluation
    if (isStBull || (eFast && eSlow && eFast > eSlow) || (vwapVal && spotPrice > vwapVal)) return "BULLISH";
    if (isStBear || (eFast && eSlow && eFast < eSlow) || (vwapVal && spotPrice < vwapVal)) return "BEARISH";

    return "NEUTRAL";
}

/**
 * Consolidate strategy signals into master consensus output
 * 
 * @param {Array} signals - Array of triggered strategy signal objects
 * @param {number} [minVotes=2] - Minimum number of strategy votes required for consensus (configurable)
 */
function consolidateSignals(signals, minVotes = 2) {
    let buyCount = 0;
    let sellCount = 0;
    let topBuySignal = null;
    let topSellSignal = null;

    for (const sig of signals) {
        if (sig.type === "BUY") {
            buyCount++;
            if (!topBuySignal || parseFloat(sig.confidence || "0") > parseFloat(topBuySignal.confidence || "0")) {
                topBuySignal = sig;
            }
        } else if (sig.type === "SELL") {
            sellCount++;
            if (!topSellSignal || parseFloat(sig.confidence || "0") > parseFloat(topSellSignal.confidence || "0")) {
                topSellSignal = sig;
            }
        }
    }

    let finalConsensus = "NO_SIGNAL";
    let chosenSignal = null;
    const reqMinVotes = Number(minVotes || 2);

    if (buyCount >= reqMinVotes && buyCount > sellCount && topBuySignal) {
        finalConsensus = "BUY";
        chosenSignal = topBuySignal;
    } else if (sellCount >= reqMinVotes && sellCount > buyCount && topSellSignal) {
        finalConsensus = "SELL";
        chosenSignal = topSellSignal;
    }

    return {
        consensus: finalConsensus,
        type: finalConsensus,
        entry: chosenSignal ? chosenSignal.entry : null,
        sl: chosenSignal ? chosenSignal.sl : null,
        tr: chosenSignal ? chosenSignal.tr : null,
        confidence: chosenSignal ? chosenSignal.confidence : "0%",
        strategyId: chosenSignal ? chosenSignal.strategyId : null,
        strategyName: chosenSignal ? chosenSignal.strategyName : null,
        triggeredSignals: signals,
        minVotesRequired: reqMinVotes,
        buyVotes: buyCount,
        sellVotes: sellCount
    };
}

/**
 * Primary Async Consensus Engine Function with Auto-Warmup via cached-historical-data.js
 * 
 * If provided inputCandles array has fewer candles than requested warmupCount (default 200),
 * it automatically calls cached-historical-data.js to fetch prior 200/400 candles up to the target date/time!
 * 
 * @param {Array|Object} inputCandles - Single candle object or array of candle objects
 * @param {number} [i=-1] - Candle index to evaluate (-1 = latest candle)
 * @param {Object} [options={}] - Options: { warmupCount: 200, minVotes: 2, securityId: "13", exchangeSegment: "IDX_I", interval: "5" }
 * @returns {Promise<Object>} Signal output { consensus, type, entry, sl, tr, confidence, strategyId, strategyName, triggeredSignals, warmupCandleCount, minVotesRequired }
 */
async function evaluateConsensusEngine(inputCandles, i = -1, options = {}) {
    let candlesArray = Array.isArray(inputCandles) ? [...inputCandles] : (inputCandles ? [inputCandles] : []);

    if (candlesArray.length === 0) {
        return {
            consensus: "NO_SIGNAL",
            type: "NO_SIGNAL",
            entry: null,
            sl: null,
            tr: null,
            confidence: "0%",
            strategyId: null,
            strategyName: null,
            triggeredSignals: []
        };
    }

    const config = loadStrategyConfig("consensus_master_head.json");
    const warmupCount = Number(options.warmupCount || options.count || config.warmupCount || 200);

    // Auto-warmup check: If input candles are less than required warmup threshold (e.g. 200 candles)
    if (candlesArray.length < warmupCount) {
        const lastCandle = candlesArray[candlesArray.length - 1];
        const targetDate = lastCandle.date || options.date;
        const targetTime = lastCandle.time || options.time;
        const securityId = lastCandle.securityId || lastCandle.symbol || options.securityId || "13";
        const exchangeSegment = lastCandle.exchangeSegment || options.exchangeSegment || "IDX_I";
        const interval = String(lastCandle.interval || options.interval || "5");

        if (targetDate) {
            try {
                const warmupRes = await getCachedCandles({
                    securityId,
                    exchangeSegment,
                    interval,
                    count: warmupCount,
                    date: targetDate,
                    time: targetTime
                });

                if (warmupRes && Array.isArray(warmupRes.data) && warmupRes.data.length > 0) {
                    const inputTimeKeys = new Set(candlesArray.map(c => `${c.date}_${c.time}`));
                    const uniqueWarmup = warmupRes.data.filter(c => !inputTimeKeys.has(`${c.date}_${c.time}`));
                    candlesArray = uniqueWarmup.concat(candlesArray);
                }
            } catch (err) {
                console.warn(`⚠️ [CONSENSUS AUTO-WARMUP] Notice: ${err.message}`);
            }
        }
    }

    return evaluateConsensusEngineSync(candlesArray, i, options);
}

/**
 * Synchronous version for callers that already pass full prepended candles (e.g. 200+ candles)
 */
function evaluateConsensusEngineSync(candlesArray, i = -1, options = {}) {
    if (!candlesArray || !Array.isArray(candlesArray) || candlesArray.length === 0) {
        return {
            consensus: "NO_SIGNAL",
            type: "NO_SIGNAL",
            entry: null,
            sl: null,
            tr: null,
            confidence: "0%",
            strategyId: null,
            strategyName: null,
            triggeredSignals: []
        };
    }

    const index = (i < 0) ? candlesArray.length - 1 : i;
    if (index < 0 || index >= candlesArray.length) {
        return {
            consensus: "NO_SIGNAL",
            type: "NO_SIGNAL",
            entry: null,
            sl: null,
            tr: null,
            confidence: "0%",
            strategyId: null,
            strategyName: null,
            triggeredSignals: []
        };
    }

    const config = loadStrategyConfig("consensus_master_head.json");
    const strategies = resolveAllStrategies(config);
    const activeGroupMinVotes = strategies.find(s => s.groupMinVotes !== undefined)?.groupMinVotes;
    const minVotes = Number(options.minVotes !== undefined ? options.minVotes : (options.minStrategyVotes !== undefined ? options.minStrategyVotes : (activeGroupMinVotes !== undefined ? activeGroupMinVotes : (config.minStrategyVotes !== undefined ? config.minStrategyVotes : (config.minVotes || 1)))));

    const c = candlesArray[index];
    const computed = (options && options.precomputed) ? options.precomputed : computeIndicators(candlesArray, {});

    const triggeredSignals = [];
    const strategyStates = [];

    for (const strat of strategies) {
        if (strat.enabled === false) continue;
        const res = evaluateSingleStrategy(c, index, candlesArray, strat, computed);
        if (res) {
            triggeredSignals.push(res);
            strategyStates.push({
                strategyId: strat.id,
                strategyName: strat.name,
                triggered: true,
                vote: res.type,
                confidence: strat.winrate || "70.0%",
                entry: res.entry,
                sl: res.sl,
                tr: res.tr,
                reason: res.reason || `🟢 All Entry Rules Met (${res.type})`
            });
        } else {
            const failReason = getStrategyFailureReason(c, index, candlesArray, strat, computed);
            strategyStates.push({
                strategyId: strat.id,
                strategyName: strat.name,
                triggered: false,
                vote: "NEUTRAL",
                confidence: strat.winrate || "70.0%",
                entry: null,
                sl: null,
                tr: null,
                reason: failReason
            });
        }
    }

    const result = consolidateSignals(triggeredSignals, minVotes);
    result.strategyStates = strategyStates;
    result.warmupCandleCount = candlesArray.length;

    // Signal Confirmation Waiting Logic
    const reqWaitMins = Number(options.confirmWaitMinutes !== undefined ? options.confirmWaitMinutes : (config.confirmWaitMinutes !== undefined ? config.confirmWaitMinutes : 0));
    const enableConfirmation = Boolean(config.enableSignalConfirmation !== false && reqWaitMins > 0);

    if (enableConfirmation && (result.consensus === "BUY" || result.consensus === "SELL")) {
        const nowMs = Date.now();
        const rawType = result.consensus;

        if (!pendingSignalTracker || pendingSignalTracker.type !== rawType) {
            pendingSignalTracker = {
                type: rawType,
                firstSeen: nowMs,
                firstSeenTimeStr: c.time || new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
                entry: result.entry,
                sl: result.sl,
                tr: result.tr,
                confidence: result.confidence,
                strategyId: result.strategyId,
                strategyName: result.strategyName
            };
        }

        const elapsedMs = nowMs - pendingSignalTracker.firstSeen;
        const elapsedMins = Number((elapsedMs / (1000 * 60)).toFixed(2));

        if (elapsedMins < reqWaitMins) {
            result.consensus = "WAITING_CONFIRMATION";
            result.type = "WAITING_CONFIRMATION";
            result.rawType = rawType;
            result.confirmation = {
                requiredWaitMins: reqWaitMins,
                elapsedMins: elapsedMins,
                remainingMins: Number(Math.max(0, reqWaitMins - elapsedMins).toFixed(2)),
                isConfirmed: false,
                status: `WAITING (${elapsedMins}m / ${reqWaitMins}m)`
            };
        } else {
            result.consensus = rawType;
            result.type = rawType;
            result.confirmation = {
                requiredWaitMins: reqWaitMins,
                elapsedMins: elapsedMins,
                remainingMins: 0,
                isConfirmed: true,
                status: "CONFIRMED"
            };
        }
    } else {
        if (result.consensus === "NO_SIGNAL") {
            pendingSignalTracker = null;
        }
        result.confirmation = null;
    }

    // Active Trade Alignment & Dynamic Confidence Ramping / Decay System
    try {
        const masterSL = getMasterSL();
        const activePos = masterSL ? masterSL.activePosition : null;
        let baseConf = parseFloat(String(result.confidence || "70%").replace('%', '')) || 70;
        let adjustedConf = baseConf;
        let alignStatus = "NO_ACTIVE_TRADE";
        let alignNote = "⚪ No active trade currently open in market.";

        const rawSignalType = (result.consensus === "WAITING_CONFIRMATION" || result.consensus === "BUILDING_CONFIRMATION" || result.consensus === "BUILDING_CONFIDENCE") ? result.rawType : result.consensus;

        if (activePos && activePos.status === "OPEN" && (rawSignalType === "BUY" || rawSignalType === "SELL")) {
            const activeDir = (activePos.optionType === "CE" || activePos.consensus === "BUY") ? "BUY" : "SELL";

            if (rawSignalType === activeDir) {
                // Same direction: Boost confidence (+15%)
                adjustedConf = Math.min(100, Number((baseConf + 15).toFixed(1)));
                alignStatus = "ALIGNED";
                alignNote = `🟢 ALIGNED with active trade (${activePos.symbol || activeDir}). Confidence boosted (+15%).`;
            } else {
                // Opposite direction: Penalize confidence (-25%)
                adjustedConf = Math.max(0, Number((baseConf - 25).toFixed(1)));
                alignStatus = "OPPOSED";
                alignNote = `🔴 OPPOSED to active trade (${activePos.symbol || activeDir}). Confidence penalized (-25%).`;
            }
        }

        // Dynamic Time-Based Confidence Ramping & Decay System (15-second Time Steps)
        const nowMs = Date.now();
        const intervalSecs = Number(config.confidenceTimeIntervalSeconds || 15);
        const intervalMs = intervalSecs * 1000;

        if (rawSignalType === "BUY" || rawSignalType === "SELL") {
            if (confidenceTimeTracker.lastSignalType === rawSignalType) {
                const elapsedMs = nowMs - confidenceTimeTracker.firstSeenMs;
                const currentStep = Math.floor(elapsedMs / intervalMs);

                if (currentStep > confidenceTimeTracker.lastIntervalStep) {
                    const stepDiff = currentStep - confidenceTimeTracker.lastIntervalStep;
                    confidenceTimeTracker.rampBonus = Math.min(25, confidenceTimeTracker.rampBonus + (stepDiff * 5));
                    confidenceTimeTracker.decayPenalty = Math.max(0, confidenceTimeTracker.decayPenalty - (stepDiff * 5));
                    confidenceTimeTracker.lastIntervalStep = currentStep;
                }
            } else {
                confidenceTimeTracker.lastSignalType = rawSignalType;
                confidenceTimeTracker.firstSeenMs = nowMs;
                confidenceTimeTracker.lastIntervalStep = 0;
                confidenceTimeTracker.rampBonus = 0;
                confidenceTimeTracker.decayPenalty = 0;
            }
        } else {
            // Neutral / NO_SIGNAL state -> Decay penalty over 15s intervals
            if (confidenceTimeTracker.lastSignalType === "NO_SIGNAL") {
                const elapsedMs = nowMs - confidenceTimeTracker.firstSeenMs;
                const currentStep = Math.floor(elapsedMs / intervalMs);

                if (currentStep > confidenceTimeTracker.lastIntervalStep) {
                    const stepDiff = currentStep - confidenceTimeTracker.lastIntervalStep;
                    confidenceTimeTracker.decayPenalty = Math.min(40, confidenceTimeTracker.decayPenalty + (stepDiff * 5));
                    confidenceTimeTracker.rampBonus = Math.max(0, confidenceTimeTracker.rampBonus - (stepDiff * 5));
                    confidenceTimeTracker.lastIntervalStep = currentStep;
                }
            } else {
                confidenceTimeTracker.lastSignalType = "NO_SIGNAL";
                confidenceTimeTracker.firstSeenMs = nowMs;
                confidenceTimeTracker.lastIntervalStep = 0;
            }
        }

        const sustainedSeconds = confidenceTimeTracker.firstSeenMs > 0 ? Math.round((nowMs - confidenceTimeTracker.firstSeenMs) / 1000) : 0;
        const finalConfNum = Math.max(0, Math.min(100, Number((adjustedConf + confidenceTimeTracker.rampBonus - confidenceTimeTracker.decayPenalty).toFixed(1))));
        const targetThreshold = Number(config.confidenceThreshold || 80);
        const isPeakConfidence = finalConfNum >= targetThreshold;

        result.alignment = {
            status: alignStatus,
            baseConfidence: baseConf + "%",
            adjustedConfidence: adjustedConf + "%",
            rampBonus: "+" + confidenceTimeTracker.rampBonus + "%",
            decayPenalty: "-" + confidenceTimeTracker.decayPenalty + "%",
            finalConfidence: finalConfNum + "%",
            threshold: targetThreshold + "%",
            thresholdMet: isPeakConfidence,
            sustainedSeconds: sustainedSeconds,
            timeInterval: intervalSecs + "s",
            note: alignNote
        };
        result.confidence = finalConfNum.toFixed(1) + "%";

        // Gating Trade Execution: Only trigger BUY/SELL if finalConfidence reaches targetThreshold (Peak Level)
        if ((result.consensus === "BUY" || result.consensus === "SELL") && !isPeakConfidence) {
            result.rawType = result.consensus;
            result.consensus = "BUILDING_CONFIDENCE";
            result.reason = `⏳ Confidence building (${finalConfNum.toFixed(1)}% / ${targetThreshold}% peak required). Sustained signal: ${sustainedSeconds}s (${intervalSecs}s time steps).`;
        }

    } catch (alignErr) {
        console.warn(`⚠️ [CONSENSUS ENGINE] Alignment confidence check notice: ${alignErr.message}`);
    }

    return result;
}

module.exports = {
    evaluateConsensusEngine,
    evaluateConsensusEngineSync,
    evaluateConsensus: evaluateConsensusEngine,
    evaluateSingleConsensusSignal: evaluateConsensusEngine,
    loadStrategyConfig,
    computeIndicators
};
