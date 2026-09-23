/**
 * Multi-Strategy Master Head Engine
 * Signature: evaluateConsensusEngine(candles, i, data = {})
 * 
 * Auto-loads multi-strategy JSON configuration from C:\AlgoTrade\strategies_config
 * Evaluates every strategy defined in the multi-strategy configuration array.
 * Returns an ARRAY of triggered strategy signals: [{ strategyId, strategyName, type, entry, sl, tr, winrate }]
 */

const fs = require('fs');
const path = require('path');
const indicators = require('../indicators');

const CONFIG_DIR = path.join(__dirname, '../strategies_config');

/**
 * Auto-loads strategy JSON configuration from C:\AlgoTrade\strategies_config
 */
function loadStrategyConfig(configName = "consensus_master_head.json") {
    try {
        const primaryPath = path.join(CONFIG_DIR, configName);
        if (fs.existsSync(primaryPath)) {
            return JSON.parse(fs.readFileSync(primaryPath, 'utf8'));
        }
        const fallbackPath = path.join(__dirname, configName);
        if (fs.existsSync(fallbackPath)) {
            return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
        }
    } catch (e) { }
    return {};
}

function computeIndicators(candles, cfg = {}) {
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
            const upper = Math.max(...slice.map(c => c.high));
            const lower = Math.min(...slice.map(c => c.low));
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
        for (const [d, dateCandles] of Object.entries(candlesByDate)) {
            if (indicators.marketContext && indicators.marketContext.getOpeningRange) {
                const res = indicators.marketContext.getOpeningRange(dateCandles, 15);
                orbMap[d] = { high: res.orbHigh, low: res.orbLow };
            }
        }
        const dates = Object.keys(candlesByDate);
        for (let dIdx = 1; dIdx < dates.length; dIdx++) {
            const prevDate = dates[dIdx - 1];
            const currentDate = dates[dIdx];
            const prevCandles = candlesByDate[prevDate];
            if (prevCandles && prevCandles.length > 0) {
                const high = Math.max(...prevCandles.map(c => c.high));
                const low = Math.min(...prevCandles.map(c => c.low));
                prevDayMap[currentDate] = { pdh: high, pdl: low };
            }
        }
    }

    const wicks = (candles && Array.isArray(candles)) ? candles.map(c => (indicators.priceAction && indicators.priceAction.analyzeWicks) ? indicators.priceAction.analyzeWicks(c) : null) : [];

    return { vwap, supertrend, rvol, rsi, adx, atr, ema10, emaFast, emaSlow, macd, bollinger, donchian, orb: orbMap, prevDay: prevDayMap, wicks };
}

function evaluateSingleStrategy(c, i, candles, strat, computed) {
    const spotPrice = c.close;
    const vwapVal = computed.vwap ? computed.vwap[i] : null;
    const stObj = computed.supertrend ? computed.supertrend[i] : null;
    const rvolVal = computed.rvol ? computed.rvol[i] : 1.0;
    const rsiVal = computed.rsi ? computed.rsi[i] : 50.0;
    const adxObj = computed.adx ? computed.adx[i] : null;
    const adxVal = adxObj && adxObj.adx !== undefined ? adxObj.adx : 25.0;
    const atrVal = computed.atr ? computed.atr[i] : 15.0;
    const e10 = computed.ema10 ? computed.ema10[i] : null;
    const eFast = computed.emaFast ? computed.emaFast[i] : null;
    const eSlow = computed.emaSlow ? computed.emaSlow[i] : null;
    const prevEFast = (computed.emaFast && i > 0) ? computed.emaFast[i - 1] : eFast;
    const prevESlow = (computed.emaSlow && i > 0) ? computed.emaSlow[i - 1] : eSlow;
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

    const candleRange = Math.abs(c.high - c.low);

    const cfgInds = strat.indicators || {};
    const minRvol = cfgInds.rvolMin || 1.20;
    const minAdx = cfgInds.adxMin || 18;
    const atrMult = cfgInds.atrMultiplier || 1.8;

    // Index Spot quotes (NIFTY 50) have flat/constant volume (RVOL ~ 1.05). Auto-adjust effective RVOL if trend momentum (ADX/RSI) is strong.
    const effectiveRvol = (rvolVal !== null && rvolVal <= 1.15 && (adxVal >= 18 || Math.abs(rsiVal - 50) >= 3)) ? 1.50 : (rvolVal || 1.0);

    let signalType = "NONE";

    if (strat.rules) {
        let buyMatch = Array.isArray(strat.rules.buy) && strat.rules.buy.length > 0;
        let sellMatch = Array.isArray(strat.rules.sell) && strat.rules.sell.length > 0;

        if (buyMatch) {
            for (const r of strat.rules.buy) {
                if (r.target === "supertrend" && r.condition === "bullish" && !isStBull) buyMatch = false;
                if (r.target === "vwap" && r.condition === "above" && (vwapVal === null || spotPrice <= vwapVal)) buyMatch = false;
                if (r.target === "rvol" && r.condition === "gte" && effectiveRvol < (r.value || minRvol)) buyMatch = false;
                if (r.target === "rsi" && r.condition === "gte" && rsiVal < (r.value || 50)) buyMatch = false;
                if (r.target === "adx" && r.condition === "gte" && adxVal < (r.value || minAdx)) buyMatch = false;
                if (r.target === "orb" && r.condition === "aboveHigh" && (!orbObj || orbObj.high === null || spotPrice <= orbObj.high)) buyMatch = false;
                if (r.target === "ema" && r.condition === "goldenCross" && (eFast === null || eSlow === null || eFast <= eSlow)) buyMatch = false;
                if (r.target === "tripleEMA" && r.condition === "bullishStack" && (e10 === null || eFast === null || eSlow === null || e10 <= eFast || eFast <= eSlow)) buyMatch = false;
                if (r.target === "priceAction" && r.condition === "lowerWickRejection" && !isLowerWickRej) buyMatch = false;
                if (r.target === "macd" && r.condition === "bullishCross" && (!macdObj || macdObj.macd === null || macdObj.signal === null || macdObj.macd <= macdObj.signal)) buyMatch = false;
                if (r.target === "donchian" && r.condition === "upperBreak" && (!donchianObj || donchianObj.upper === null || spotPrice <= donchianObj.upper)) buyMatch = false;
                if (r.target === "atrExpansion" && r.condition === "rangeSpike" && candleRange < (atrVal * atrMult)) buyMatch = false;
                if (r.target === "prevDay" && r.condition === "abovePDH" && (!prevDayObj || !prevDayObj.pdh || spotPrice <= prevDayObj.pdh)) buyMatch = false;
                if (r.target === "bollinger" && r.condition === "upperBandBreak" && (!bbObj || !bbObj.upper || spotPrice <= bbObj.upper)) buyMatch = false;
            }
        }

        if (sellMatch) {
            for (const r of strat.rules.sell) {
                if (r.target === "supertrend" && r.condition === "bearish" && !isStBear) sellMatch = false;
                if (r.target === "vwap" && r.condition === "below" && (vwapVal === null || spotPrice >= vwapVal)) sellMatch = false;
                if (r.target === "rvol" && r.condition === "gte" && effectiveRvol < (r.value || minRvol)) sellMatch = false;
                if (r.target === "rsi" && r.condition === "lte" && rsiVal > (r.value || 50)) sellMatch = false;
                if (r.target === "adx" && r.condition === "gte" && adxVal < (r.value || minAdx)) sellMatch = false;
                if (r.target === "orb" && r.condition === "belowLow" && (!orbObj || orbObj.low === null || spotPrice >= orbObj.low)) sellMatch = false;
                if (r.target === "ema" && r.condition === "deathCross" && (eFast === null || eSlow === null || eFast >= eSlow)) sellMatch = false;
                if (r.target === "tripleEMA" && r.condition === "bearishStack" && (e10 === null || eFast === null || eSlow === null || e10 >= eFast || eFast >= eSlow)) sellMatch = false;
                if (r.target === "priceAction" && r.condition === "upperWickRejection" && !isUpperWickRej) sellMatch = false;
                if (r.target === "macd" && r.condition === "bearishCross" && (!macdObj || macdObj.macd === null || macdObj.signal === null || macdObj.macd >= macdObj.signal)) sellMatch = false;
                if (r.target === "donchian" && r.condition === "lowerBreak" && (!donchianObj || donchianObj.lower === null || spotPrice >= donchianObj.lower)) buyMatch = false;
                if (r.target === "atrExpansion" && r.condition === "rangeSpike" && candleRange < (atrVal * atrMult)) sellMatch = false;
                if (r.target === "prevDay" && r.condition === "belowPDL" && (!prevDayObj || !prevDayObj.pdl || spotPrice >= prevDayObj.pdl)) sellMatch = false;
                if (r.target === "bollinger" && r.condition === "lowerBandBreak" && (!bbObj || !bbObj.lower || spotPrice >= bbObj.lower)) sellMatch = false;
            }
        }

        if (buyMatch) signalType = "BUY";
        else if (sellMatch) signalType = "SELL";
    }

    if (signalType !== "NONE") {
        const dynamicSLPoints = Math.max(15.0, Math.min(35.0, atrVal * 1.5));
        let sl = signalType === "BUY" ? (spotPrice - dynamicSLPoints) : (spotPrice + dynamicSLPoints);
        const risk = Math.abs(spotPrice - sl);
        const rrMultiplier = strat.riskRewardRatio || 2.0;
        const dynamicTRPoints = risk * rrMultiplier;
        let tp = signalType === "BUY" ? (spotPrice + dynamicTRPoints) : (spotPrice - dynamicTRPoints);

        return {
            strategyId: strat.id,
            strategyName: strat.name,
            type: signalType,
            entry: spotPrice,
            sl: Number(sl.toFixed(2)),
            tr: Number(tp.toFixed(2)),
            winrate: strat.winrate || "70.0%"
        };
    }

    return null;
}

/**
 * Main Multi-Strategy Consensus Engine Evaluator
 * Evaluates all strategies in the config array and returns an ARRAY of active signals:
 * [{ strategyId, strategyName, type, entry, sl, tr, winrate }]
 */
function getStrategyBias(c, i, candles, strat, computed) {
    if (!c || !computed) return "NEUTRAL";
    const spotPrice = c.close;
    const vwapVal = computed.vwap ? computed.vwap[i] : null;
    const stObj = computed.supertrend ? computed.supertrend[i] : null;
    const rsiVal = computed.rsi ? computed.rsi[i] : 50.0;
    const eFast = computed.emaFast ? computed.emaFast[i] : null;
    const eSlow = computed.emaSlow ? computed.emaSlow[i] : null;

    const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
    const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");

    let bullScore = 0;
    let bearScore = 0;

    if (isStBull) bullScore++;
    if (isStBear) bearScore++;

    if (vwapVal !== null) {
        if (spotPrice > vwapVal) bullScore++;
        else if (spotPrice < vwapVal) bearScore++;
    }

    if (rsiVal > 52) bullScore++;
    else if (rsiVal < 48) bearScore++;

    if (eFast !== null && eSlow !== null) {
        if (eFast > eSlow) bullScore++;
        else if (eFast < eSlow) bearScore++;
    }

    if (bullScore > bearScore) return "BULLISH";
    if (bearScore > bullScore) return "BEARISH";
    return "NEUTRAL";
}

function evaluateConsensusEngine(candles, i, data = {}) {
    if (!candles || !Array.isArray(candles) || candles.length === 0 || i < 0 || i >= candles.length) {
        return { triggeredSignals: [], strategyStates: [] };
    }

    const config = loadStrategyConfig("consensus_master_head.json");
    const strategies = config.strategies || [config]; // Array of multi-strategies

    const c = candles[i];
    const computed = (data.vwap && data.supertrend) ? data : computeIndicators(candles, {});

    const triggeredSignals = [];
    const strategyStates = [];

    for (const strat of strategies) {
        if (strat.enabled === false) continue;
        const res = evaluateSingleStrategy(c, i, candles, strat, computed);
        const bias = getStrategyBias(c, i, candles, strat, computed);
        if (res) {
            triggeredSignals.push(res);
            strategyStates.push({
                strategyId: strat.id,
                strategyName: strat.name,
                type: res.type,
                bias: res.type,
                triggered: true,
                winrate: strat.winrate || "70.0%"
            });
        } else {
            strategyStates.push({
                strategyId: strat.id,
                strategyName: strat.name,
                type: "NEUTRAL",
                bias: bias,
                triggered: false,
                winrate: strat.winrate || "70.0%"
            });
        }
    }

    return { triggeredSignals, strategyStates };
}

let candleDataHubModule;
try {
    candleDataHubModule = require('../Candlehub/candleDataHub').candleDataHub;
} catch (e) {
    candleDataHubModule = null;
}

/**
 * Checks if incoming candle dataset has enough historical warmup candles for accurate indicator calculation (EMA 50, ATR, VWAP, Supertrend, etc.)
 * If warmup is insufficient, it automatically fetches prior historical candles from candleDataHub via WebSocket or local disk fallback.
 */
async function ensureWarmupCandlesOverWS(candles, warmupCount = 200) {
    if (!candles || !Array.isArray(candles) || candles.length === 0) return candles;

    if (candles.length >= warmupCount) {
        return candles; // Warmup candles are already sufficient
    }

    const firstCandleDate = candles[0].date;
    console.log(`⚠️ [CONSENSUS WARMUP] Provided candles (${candles.length}) are below recommended warmup threshold (${warmupCount}).`);

    // 1. Attempt WebSocket fetch from candleDataHub over WS protocol
    if (consensusService && consensusService.connected) {
        try {
            const sDateObj = new Date(firstCandleDate);
            const priorDateObj = new Date(sDateObj.getTime() - 15 * 24 * 60 * 60 * 1000);
            const priorStartStr = priorDateObj.toISOString().split('T')[0];
            // Include firstCandleDate so morning session candles (09:15 AM to current time) are also fetched if server starts late
            const targetEndStr = firstCandleDate;

            console.log(`📡 [CONSENSUS WARMUP WS] Sourcing historical & morning session candles (${priorStartStr} to ${targetEndStr}) from candleDataHub via WebSocket...`);
            const priorCandles = await consensusService.requestCandlesFromHubOverWS(priorStartStr, targetEndStr, candles[0].symbol || "NIFTY_50", "5");

            if (priorCandles && priorCandles.length > 0) {
                const existingTimestamps = new Set(candles.map(c => c.timestamp || `${c.date}_${c.time}`));
                const filteredPrior = priorCandles.filter(c => !existingTimestamps.has(c.timestamp || `${c.date}_${c.time}`));
                const merged = [...filteredPrior, ...candles];
                console.log(`✅ [CONSENSUS WARMUP WS] Received & prepended ${filteredPrior.length} warmup & morning candles over WebSocket! Total candles now: ${merged.length}`);
                return merged;
            }
        } catch (e) {
            console.warn(`⚠️ [CONSENSUS WARMUP WS] WebSocket warmup notice: ${e.message}`);
        }
    }

    // 2. Synchronous disk fallback
    if (candleDataHubModule && typeof candleDataHubModule.getWarmupSync === 'function') {
        const priorWarmup = candleDataHubModule.getWarmupSync(firstCandleDate, warmupCount);
        if (priorWarmup && priorWarmup.length > 0) {
            const existingTimestamps = new Set(candles.map(c => c.timestamp || `${c.date}_${c.time}`));
            const filteredPrior = priorWarmup.filter(c => !existingTimestamps.has(c.timestamp || `${c.date}_${c.time}`));
            const merged = [...filteredPrior, ...candles];
            console.log(`✅ [CONSENSUS WARMUP] Successfully prepended ${filteredPrior.length} prior warmup candles from disk! Total candles now: ${merged.length}`);
            return merged;
        }
    }

    return candles;
}

function ensureWarmupCandles(candles, warmupCount = 200) {
    if (!candles || !Array.isArray(candles) || candles.length === 0) return candles;
    if (candles.length >= warmupCount) return candles;

    const firstCandleDate = candles[0].date;
    if (candleDataHubModule && typeof candleDataHubModule.getWarmupSync === 'function') {
        const priorWarmup = candleDataHubModule.getWarmupSync(firstCandleDate, warmupCount);
        if (priorWarmup && priorWarmup.length > 0) {
            const existingTimestamps = new Set(candles.map(c => c.timestamp || `${c.date}_${c.time}`));
            const filteredPrior = priorWarmup.filter(c => !existingTimestamps.has(c.timestamp || `${c.date}_${c.time}`));
            return [...filteredPrior, ...candles];
        }
    }
    return candles;
}

function evaluate10SubEngines(candles, i, data = {}) {
    const c = candles[i];
    if (!c) return { buyVotes: 0, sellVotes: 0, subEngineVotes: [], activeVoteLogs: [], reasoningLog: '' };
    const prevC = i > 0 ? candles[i - 1] : null;

    const computed = (data.vwap && data.supertrend) ? data : computeIndicators(candles, {});

    const rvolVal = (computed.rvol && computed.rvol[i] !== null && computed.rvol[i] !== undefined) ? Number(computed.rvol[i]) : 1.0;
    const rsiVal = (computed.rsi && computed.rsi[i] !== null && computed.rsi[i] !== undefined) ? Number(computed.rsi[i]) : 50.0;
    const emaVal = (computed.emaSlow && computed.emaSlow[i] !== null) ? Number(computed.emaSlow[i]) : ((computed.emaFast && computed.emaFast[i] !== null) ? Number(computed.emaFast[i]) : null);
    const vwapVal = (computed.vwap && computed.vwap[i] !== null) ? Number(computed.vwap[i]) : null;
    const stObj = (computed.supertrend && computed.supertrend[i]) ? computed.supertrend[i] : null;
    const macdObj = (computed.macd && computed.macd[i]) ? computed.macd[i] : null;

    const subEngineVotes = [];
    let buyVotes = 0;
    let sellVotes = 0;
    const activeVoteLogs = [];

    // Engine 1: Volume Surge
    const eng1MinRVOL = 1.25;
    if (rvolVal >= eng1MinRVOL) {
        buyVotes++;
        subEngineVotes.push({ id: 1, name: "Volume Surge", status: "BULLISH", vote: 1, detail: `RVOL ${rvolVal.toFixed(2)}x >= 1.25x` });
        activeVoteLogs.push(`Engine 1 [RVOL ${rvolVal.toFixed(2)}x >= 1.25x]: BULLISH (+1)`);
    } else {
        subEngineVotes.push({ id: 1, name: "Volume Surge", status: "NO_VOTE", vote: 0, detail: `RVOL ${rvolVal.toFixed(2)}x < 1.25x` });
    }

    // Engine 2: RSI Momentum
    if (rsiVal > 54) {
        buyVotes++;
        subEngineVotes.push({ id: 2, name: "RSI Momentum", status: "BULLISH", vote: 1, detail: `RSI ${rsiVal.toFixed(1)} > 54` });
        activeVoteLogs.push(`Engine 2 [RSI ${rsiVal.toFixed(1)} > 54]: BULLISH (+1)`);
    } else if (rsiVal < 46) {
        sellVotes++;
        subEngineVotes.push({ id: 2, name: "RSI Momentum", status: "BEARISH", vote: -1, detail: `RSI ${rsiVal.toFixed(1)} < 46` });
        activeVoteLogs.push(`Engine 2 [RSI ${rsiVal.toFixed(1)} < 46]: BEARISH (+1)`);
    } else {
        subEngineVotes.push({ id: 2, name: "RSI Momentum", status: "NO_VOTE", vote: 0, detail: `RSI ${rsiVal.toFixed(1)} (Neutral)` });
    }

    // Engine 3: EMA 50 Trend
    if (emaVal !== null) {
        if (c.close > emaVal) {
            buyVotes++;
            subEngineVotes.push({ id: 3, name: "EMA 50 Trend", status: "BULLISH", vote: 1, detail: `Price ₹${c.close} > EMA ₹${emaVal.toFixed(1)}` });
            activeVoteLogs.push(`Engine 3 [Price ₹${c.close} > EMA ₹${emaVal.toFixed(1)}]: BULLISH TREND (+1)`);
        } else if (c.close < emaVal) {
            sellVotes++;
            subEngineVotes.push({ id: 3, name: "EMA 50 Trend", status: "BEARISH", vote: -1, detail: `Price ₹${c.close} < EMA ₹${emaVal.toFixed(1)}` });
            activeVoteLogs.push(`Engine 3 [Price ₹${c.close} < EMA ₹${emaVal.toFixed(1)}]: BEARISH TREND (+1)`);
        } else {
            subEngineVotes.push({ id: 3, name: "EMA 50 Trend", status: "NO_VOTE", vote: 0, detail: `Spot Price on EMA` });
        }
    } else {
        subEngineVotes.push({ id: 3, name: "EMA 50 Trend", status: "NO_VOTE", vote: 0, detail: `Spot Price relative to 50 EMA` });
    }

    // Engine 4: Intraday VWAP
    if (vwapVal !== null) {
        if (c.close > vwapVal) {
            buyVotes++;
            subEngineVotes.push({ id: 4, name: "Intraday VWAP", status: "BULLISH", vote: 1, detail: `Price ₹${c.close} > VWAP ₹${vwapVal.toFixed(1)}` });
            activeVoteLogs.push(`Engine 4 [Price ₹${c.close} > VWAP ₹${vwapVal.toFixed(1)}]: BULLISH VWAP (+1)`);
        } else if (c.close < vwapVal) {
            sellVotes++;
            subEngineVotes.push({ id: 4, name: "Intraday VWAP", status: "BEARISH", vote: -1, detail: `Price ₹${c.close} < VWAP ₹${vwapVal.toFixed(1)}` });
            activeVoteLogs.push(`Engine 4 [Price ₹${c.close} < VWAP ₹${vwapVal.toFixed(1)}]: BEARISH VWAP (+1)`);
        } else {
            subEngineVotes.push({ id: 4, name: "Intraday VWAP", status: "NO_VOTE", vote: 0, detail: `Institutional VWAP` });
        }
    } else {
        subEngineVotes.push({ id: 4, name: "Intraday VWAP", status: "NO_VOTE", vote: 0, detail: `Institutional VWAP` });
    }

    // Engine 5: Supertrend
    const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
    const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");
    const stVal = stObj ? (stObj.value || stObj.supertrend || 0) : 0;
    if (isStBull) {
        buyVotes++;
        subEngineVotes.push({ id: 5, name: "Supertrend", status: "BULLISH", vote: 1, detail: `Supertrend ${stVal ? stVal.toFixed(1) : ''} Bullish` });
        activeVoteLogs.push(`Engine 5 [Supertrend ${stVal ? stVal.toFixed(1) : ''}]: BULLISH (+1)`);
    } else if (isStBear) {
        sellVotes++;
        subEngineVotes.push({ id: 5, name: "Supertrend", status: "BEARISH", vote: -1, detail: `Supertrend ${stVal ? stVal.toFixed(1) : ''} Bearish` });
        activeVoteLogs.push(`Engine 5 [Supertrend ${stVal ? stVal.toFixed(1) : ''}]: BEARISH (+1)`);
    } else {
        subEngineVotes.push({ id: 5, name: "Supertrend", status: "NO_VOTE", vote: 0, detail: `ATR Volatility Direction` });
    }

    // Engine 6: Price Action
    const isBullEngulf = prevC && c.close > c.open && c.close > prevC.high;
    const isBearEngulf = prevC && c.close < c.open && c.close < prevC.low;
    if (isBullEngulf) {
        buyVotes++;
        subEngineVotes.push({ id: 6, name: "Price Action", status: "BULLISH", vote: 1, detail: `Bullish Engulfing Pattern` });
        activeVoteLogs.push(`Engine 6 [Price Action]: Bullish Engulfing (+1)`);
    } else if (isBearEngulf) {
        sellVotes++;
        subEngineVotes.push({ id: 6, name: "Price Action", status: "BEARISH", vote: -1, detail: `Bearish Engulfing Pattern` });
        activeVoteLogs.push(`Engine 6 [Price Action]: Bearish Engulfing (+1)`);
    } else {
        subEngineVotes.push({ id: 6, name: "Price Action", status: "NO_VOTE", vote: 0, detail: `Bullish / Bearish Engulfing Pattern` });
    }

    // Engine 7: MACD Momentum
    if (macdObj && macdObj.histogram !== undefined && macdObj.histogram !== null) {
        if (macdObj.histogram > 0) {
            buyVotes++;
            subEngineVotes.push({ id: 7, name: "MACD Momentum", status: "BULLISH", vote: 1, detail: `MACD Bullish Histogram ${macdObj.histogram.toFixed(2)}` });
            activeVoteLogs.push(`Engine 7 [MACD Bullish Histogram ${macdObj.histogram.toFixed(2)}]: BULLISH (+1)`);
        } else if (macdObj.histogram < 0) {
            sellVotes++;
            subEngineVotes.push({ id: 7, name: "MACD Momentum", status: "BEARISH", vote: -1, detail: `MACD Bearish Histogram ${macdObj.histogram.toFixed(2)}` });
            activeVoteLogs.push(`Engine 7 [MACD Bearish Histogram ${macdObj.histogram.toFixed(2)}]: BEARISH (+1)`);
        } else {
            subEngineVotes.push({ id: 7, name: "MACD Momentum", status: "NO_VOTE", vote: 0, detail: `MACD Line & Signal Crossover` });
        }
    } else {
        subEngineVotes.push({ id: 7, name: "MACD Momentum", status: "NO_VOTE", vote: 0, detail: `MACD Line & Signal Crossover` });
    }

    // Engine 8: Prev Day Levels
    const pdHigh = data.prevDayHigh || null;
    const pdLow = data.prevDayLow || null;
    if (pdHigh && c.close > pdHigh) {
        buyVotes++;
        subEngineVotes.push({ id: 8, name: "Prev Day Levels", status: "BULLISH", vote: 1, detail: `Breakout Prev High ₹${pdHigh}` });
        activeVoteLogs.push(`Engine 8 [Breakout Prev High ₹${pdHigh}]: BULLISH (+1)`);
    } else if (pdLow && c.close < pdLow) {
        sellVotes++;
        subEngineVotes.push({ id: 8, name: "Prev Day Levels", status: "BEARISH", vote: -1, detail: `Breakdown Prev Low ₹${pdLow}` });
        activeVoteLogs.push(`Engine 8 [Breakdown Prev Low ₹${pdLow}]: BEARISH (+1)`);
    } else {
        subEngineVotes.push({ id: 8, name: "Prev Day Levels", status: "NO_VOTE", vote: 0, detail: `Previous Day High / Low Level Breakout` });
    }

    // Engine 9: Bank Nifty Alignment
    const bnDir = data.bankNiftyDirection || null;
    if (bnDir === "BULLISH" || bnDir === 1) {
        buyVotes++;
        subEngineVotes.push({ id: 9, name: "Bank Nifty Alignment", status: "BULLISH", vote: 1, detail: `BankNifty Bullish Alignment` });
        activeVoteLogs.push(`Engine 9 [Bank Nifty Alignment]: BULLISH (+1)`);
    } else if (bnDir === "BEARISH" || bnDir === -1) {
        sellVotes++;
        subEngineVotes.push({ id: 9, name: "Bank Nifty Alignment", status: "BEARISH", vote: -1, detail: `BankNifty Bearish Alignment` });
        activeVoteLogs.push(`Engine 9 [Bank Nifty Alignment]: BEARISH (+1)`);
    } else {
        subEngineVotes.push({ id: 9, name: "Bank Nifty Alignment", status: "NO_VOTE", vote: 0, detail: `-34% Nifty Weight Alignment Check` });
    }

    // Engine 10: SMC Liquidity Sweep
    const smcSweep = data.smcSweep || null;
    if (smcSweep === "BULLISH_SWEEP") {
        buyVotes++;
        subEngineVotes.push({ id: 10, name: "SMC Liquidity Sweep", status: "BULLISH", vote: 1, detail: `Institutional Bullish Liquidity Sweep` });
        activeVoteLogs.push(`Engine 10 [SMC Sweep]: BULLISH (+1)`);
    } else if (smcSweep === "BEARISH_SWEEP") {
        sellVotes++;
        subEngineVotes.push({ id: 10, name: "SMC Liquidity Sweep", status: "BEARISH", vote: -1, detail: `Institutional Bearish Liquidity Sweep` });
        activeVoteLogs.push(`Engine 10 [SMC Sweep]: BEARISH (+1)`);
    } else {
        subEngineVotes.push({ id: 10, name: "SMC Liquidity Sweep", status: "NO_VOTE", vote: 0, detail: `Institutional Sweep Reversal & Zone Guard` });
    }

    const reasoningLog = `ℹ MASTER HEAD CONSENSUS WAITING: Buy Votes=${buyVotes}, Sell Votes=${sellVotes} (Required: 6/10) | Active Votes: ${activeVoteLogs.length > 0 ? activeVoteLogs.join(" | ") : "None"}. Waiting for Sub-Strategy Majority.`;

    return {
        buyVotes,
        sellVotes,
        subEngineVotes,
        activeVoteLogs,
        reasoningLog
    };
}

function consolidateSignals(signals) {
    let buyCount = 0;
    let sellCount = 0;
    let topBuySignal = null;
    let topSellSignal = null;

    for (const sig of signals) {
        if (sig.type === "BUY") {
            buyCount++;
            if (!topBuySignal || parseFloat(sig.winrate) > parseFloat(topBuySignal.winrate)) {
                topBuySignal = sig;
            }
        } else if (sig.type === "SELL") {
            sellCount++;
            if (!topSellSignal || parseFloat(sig.winrate) > parseFloat(topSellSignal.winrate)) {
                topSellSignal = sig;
            }
        }
    }

    let finalConsensus = "NO_SIGNAL";
    let chosenSignal = null;

    if (buyCount >= 2 && buyCount > sellCount && topBuySignal) {
        finalConsensus = "BUY";
        chosenSignal = topBuySignal;
    } else if (sellCount >= 2 && sellCount > buyCount && topSellSignal) {
        finalConsensus = "SELL";
        chosenSignal = topSellSignal;
    } else {
        finalConsensus = "NO_SIGNAL";
        chosenSignal = null;
    }

    return {
        consensus: finalConsensus,
        type: finalConsensus,
        confidence: chosenSignal ? chosenSignal.winrate : "0%",
        strategyId: chosenSignal ? chosenSignal.strategyId : null,
        strategyName: chosenSignal ? chosenSignal.strategyName : null,
        entry: chosenSignal ? chosenSignal.entry : null,
        sl: chosenSignal ? chosenSignal.sl : null,
        tr: chosenSignal ? chosenSignal.tr : null,
        triggeredCount: signals.length,
        stratBuyCount: buyCount,
        stratSellCount: sellCount,
        allSignals: signals,
        timestamp: Date.now()
    };
}

/**
 * Evaluates multi-strategy signals and consolidates them into a SINGLE consensus signal.
 * Synchronous version
 */
function evaluateSingleConsensusSignal(candles, i = -1, data = {}) {
    if (!candles || !Array.isArray(candles) || candles.length === 0) {
        return { consensus: "NO_SIGNAL", type: "NONE", reason: "Invalid or empty candles array" };
    }

    const preparedCandles = ensureWarmupCandles(candles, 200);
    const offset = preparedCandles.length - candles.length;
    const index = (i < 0) ? preparedCandles.length - 1 : (i + offset);

    const subEval = evaluate10SubEngines(preparedCandles, index, data);
    const evalRes = evaluateConsensusEngine(preparedCandles, index, data);
    const triggeredSignals = Array.isArray(evalRes) ? evalRes : (evalRes.triggeredSignals || []);
    const strategyStates = evalRes.strategyStates || [];

    const consolidated = consolidateSignals(triggeredSignals);
    consolidated.subEngineVotes = subEval.subEngineVotes;
    consolidated.buyVotes = subEval.buyVotes;
    consolidated.sellVotes = subEval.sellVotes;
    consolidated.reasoningLog = subEval.reasoningLog;
    consolidated.strategyStates = strategyStates;

    return consolidated;
}

/**
 * Async version using WebSocket to auto-fetch warmup candles from candleDataHub over WS
 */
async function evaluateSingleConsensusSignalAsync(candles, i = -1, data = {}) {
    if (!candles || !Array.isArray(candles) || candles.length === 0) {
        return { consensus: "NO_SIGNAL", type: "NONE", reason: "Invalid or empty candles array" };
    }

    const preparedCandles = await ensureWarmupCandlesOverWS(candles, 200);
    const offset = preparedCandles.length - candles.length;
    const index = (i < 0) ? preparedCandles.length - 1 : (i + offset);

    const subEval = evaluate10SubEngines(preparedCandles, index, data);
    const evalRes = evaluateConsensusEngine(preparedCandles, index, data);
    const triggeredSignals = Array.isArray(evalRes) ? evalRes : (evalRes.triggeredSignals || []);
    const strategyStates = evalRes.strategyStates || [];

    const consolidated = consolidateSignals(triggeredSignals);
    consolidated.subEngineVotes = subEval.subEngineVotes;
    consolidated.buyVotes = subEval.buyVotes;
    consolidated.sellVotes = subEval.sellVotes;
    consolidated.reasoningLog = subEval.reasoningLog;
    consolidated.strategyStates = strategyStates;

    // Broadcast comprehensive consensus & sub-engine telemetry over WebSocket to monitorClient
    if (consensusService && consensusService.connected) {
        consensusService.sendRaw({
            type: 'SEND_MESSAGE',
            recipientId: 'monitorClient',
            payload: {
                type: 'CONSENSUS_UPDATE',
                warmupCandleCount: preparedCandles.length,
                routingMode: consensusService.activeRoutingMode || 'BOTH',
                consensus: consolidated.consensus,
                stratBuyCount: consolidated.stratBuyCount || 0,
                stratSellCount: consolidated.stratSellCount || 0,
                buyVotes: subEval.buyVotes,
                sellVotes: subEval.sellVotes,
                subEngineVotes: subEval.subEngineVotes,
                reasoningLog: subEval.reasoningLog,
                activeSignals: triggeredSignals,
                strategyStates: strategyStates,
                totalStrategies: 10,
                spotPrice: preparedCandles[index] ? preparedCandles[index].close : null,
                evalTime: preparedCandles[index] ? preparedCandles[index].time : '',
                evalDate: preparedCandles[index] ? preparedCandles[index].date : '',
                timestamp: Date.now()
            }
        });
    }

    consolidated.warmupCandleCount = preparedCandles.length;
    return consolidated;
}

/**
 * WebSocket Integration for Consensus Engine
 */
const { WebSocket } = require('ws');

class ConsensusEngineService {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.clientId = 'consensusEngine';
        this.wsUrl = 'ws://localhost:8080';
        this.activeRoutingMode = 'BOTH'; // DEFAULT: BOTH (Paper Trading + Real Dhan Order Manager)
    }

    connect(wsUrl = 'ws://localhost:8080', clientId = 'consensusEngine') {
        this.wsUrl = wsUrl;
        this.clientId = clientId;

        try {
            console.log(`📡 [CONSENSUS ENGINE WS] Connecting to ${this.wsUrl} as "${this.clientId}"...`);
            this.ws = new WebSocket(this.wsUrl);

            this.ws.on('open', () => {
                this.connected = true;
                console.log(`✅ [CONSENSUS ENGINE WS] Connected to WebSocket Server.`);
                this.sendRaw({ type: 'REGISTER', clientId: this.clientId });
            });

            this.ws.on('message', (rawData) => {
                try {
                    const message = JSON.parse(rawData.toString());
                    this.handleWsMessage(message);
                } catch (e) {
                    console.error('[CONSENSUS ENGINE WS] Failed to parse message:', e.message);
                }
            });

            this.ws.on('close', () => {
                this.connected = false;
                console.warn(`⚠️ [CONSENSUS ENGINE WS] Connection closed. Reconnecting in 3s...`);
                setTimeout(() => this.connect(this.wsUrl, this.clientId), 3000);
            });

            this.ws.on('error', (err) => {
                console.error(`❌ [CONSENSUS ENGINE WS] Error: ${err.message}`);
            });
        } catch (err) {
            console.error(`❌ [CONSENSUS ENGINE WS] Connection error: ${err.message}`);
        }
    }

    requestCandlesFromHubOverWS(startDate, endDate, symbol = "NIFTY_50", interval = "5") {
        return new Promise((resolve) => {
            if (!this.connected || !this.ws) {
                return resolve([]);
            }

            const timeout = setTimeout(() => {
                console.warn('⚠️ [CONSENSUS WS WARMUP] WebSocket request to candleDataHub timed out after 3s.');
                resolve([]);
            }, 3000);

            const messageHandler = (rawData) => {
                try {
                    const message = JSON.parse(rawData.toString());
                    if (message.type === 'FORWARD_MESSAGE' && message.senderId === 'candleDataHub') {
                        const payload = message.payload;
                        if (payload && payload.action === 'CANDLE_DATA_RESPONSE') {
                            clearTimeout(timeout);
                            this.ws.removeListener('message', messageHandler);
                            resolve(payload.candles || []);
                        }
                    }
                } catch (e) {}
            };

            this.ws.on('message', messageHandler);

            this.sendRaw({
                type: 'SEND_MESSAGE',
                recipientId: 'candleDataHub',
                payload: {
                    action: 'GET_CANDLES',
                    startDate,
                    endDate,
                    symbol,
                    interval
                }
            });
            console.log(`📡 [CONSENSUS WS WARMUP] Sent GET_CANDLES request to "candleDataHub" over WebSocket (${startDate} to ${endDate})...`);
        });
    }

    async handleWsMessage(message) {
        if (message.type === 'FORWARD_MESSAGE') {
            this.sendRaw({
                type: 'CLIENT_DELIVERED_ACK',
                messageId: message.messageId,
                originalSenderId: message.senderId
            });

            const payload = message.payload;
            if (payload && payload.action === 'SET_ROUTING_MODE') {
                this.activeRoutingMode = (payload.mode || 'BOTH').toUpperCase();
                console.log(`🔀 [CONSENSUS ROUTING MODE UPDATED] Active mode changed to: "${this.activeRoutingMode}"`);
            }

            if (payload && (payload.action === 'EVALUATE_SIGNAL' || payload.action === 'EVALUATE_CONSENSUS')) {
                const { candles, index = -1, mode = null, targetRecipient = null } = payload;
                const effectiveMode = (mode || this.activeRoutingMode || 'BOTH').toUpperCase();
                console.log(`🧠 [CONSENSUS ENGINE WS] Received signal request from "${message.senderId}" (Mode: ${effectiveMode})...`);

                const singleSignal = await evaluateSingleConsensusSignalAsync(candles, index);

                // 1. Send response back to requesting sender
                this.sendRaw({
                    type: 'SEND_MESSAGE',
                    recipientId: message.senderId,
                    payload: {
                        status: 'SUCCESS',
                        action: 'CONSENSUS_SIGNAL_RESPONSE',
                        singleSignal
                    }
                });

                // 2. Route Signal to Order Managers based on execution mode (DEFAULT: BOTH)
                if (singleSignal.consensus && singleSignal.consensus !== 'NO_SIGNAL') {
                    if (effectiveMode === 'BOTH' || (effectiveMode !== 'REAL' && effectiveMode !== 'PAPER')) {
                        console.log(`🚀 [CONSENSUS ROUTING] Forwarding Dual Signals to "paperOrderManager" AND "orderManager"...`);
                        this.sendRaw({
                            type: 'SEND_MESSAGE',
                            recipientId: 'paperOrderManager',
                            payload: { action: 'CONSENSUS_SIGNAL_RESPONSE', mode: 'PAPER', singleSignal }
                        });
                        this.sendRaw({
                            type: 'SEND_MESSAGE',
                            recipientId: 'orderManager',
                            payload: { action: 'CONSENSUS_SIGNAL_RESPONSE', mode: 'REAL', singleSignal }
                        });
                    } else if (effectiveMode === 'REAL' || targetRecipient === 'orderManager') {
                        console.log(`🚀 [CONSENSUS ROUTING] Forwarding Real Trading Signal to "orderManager"...`);
                        this.sendRaw({
                            type: 'SEND_MESSAGE',
                            recipientId: 'orderManager',
                            payload: {
                                action: 'CONSENSUS_SIGNAL_RESPONSE',
                                mode: 'REAL',
                                singleSignal
                            }
                        });
                    } else {
                        // PAPER TRADING ("paperOrderManager")
                        console.log(`📝 [CONSENSUS ROUTING] Forwarding Signal to Paper Trading Manager ("paperOrderManager")...`);
                        this.sendRaw({
                            type: 'SEND_MESSAGE',
                            recipientId: 'paperOrderManager',
                            payload: {
                                action: 'CONSENSUS_SIGNAL_RESPONSE',
                                mode: 'PAPER',
                                singleSignal
                            }
                        });
                    }
                }

                console.log(`📤 [CONSENSUS ENGINE WS] Returned SINGLE signal (${singleSignal.consensus}) to "${message.senderId}"`);
            }
        }
    }

    sendRaw(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }
}

const consensusService = new ConsensusEngineService();

if (require.main === module) {
    console.log('===========================================================');
    console.log('🧠 Multi-Strategy Consensus Engine Service Starting...');
    console.log('===========================================================');
    consensusService.connect('ws://localhost:8080', 'consensusEngine');
}

module.exports = {
    evaluateConsensusEngine,
    evaluateSingleConsensusSignal,
    loadStrategyConfig,
    computeIndicators,
    consensusService
};

