/**
 * Fibonacci-Only Consensus Engine (First 5M Candle Strategy)
 * Location: C:\AlgoTrade\utility\usedfull\Engines\consensusEngine.js
 * 
 * Features:
 * - Pure Input -> Output Evaluation: Accepts Candle Data -> Returns Strategy Output Signal.
 * - Auto-Warmup via cached-historical-data.js
 * - Only uses Fibonacci Golden Zone (0.44, 0.50, 0.56) based on First 5M Candle.
 */

const fs = require('fs');
const path = require('path');
const { getCachedCandles } = require('../cached-historical-data');

const CONFIG_PATH = path.join(__dirname, 'consensus_master_head.json');

// ==========================================
// 🛠️ हेल्पर फंक्शन्स
// ==========================================

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

function resolveAllStrategies(config = {}) {
    const loadedStrategies = [];
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
    return loadedStrategies;
}

/**
 * 📊 Fibonacci लाइनें कैलकुलेट करने का फंक्शन
 */
function calculateFibLevels(firstCandle) {
    const firstOpen = Number(firstCandle.open || firstCandle.candleOpen);
    const firstClose = Number(firstCandle.close || firstCandle.candleClose);
    const firstHigh = Number(firstCandle.high || firstCandle.candleHigh);
    const firstLow = Number(firstCandle.low || firstCandle.candleLow);

    const isFirstGreen = firstClose > firstOpen;
    const diff = firstHigh - firstLow;
    const levels = {};

    // 0.44, 0.50, 0.56 का कैलकुलेशन
    const targetRatios = { "0.44": 0.44, "0.50": 0.50, "0.56": 0.56 };
    for (const [key, ratio] of Object.entries(targetRatios)) {
        if (isFirstGreen) {
            // ग्रीन है तो नीचे से ऊपर (Low to High)
            levels[key] = Number((firstHigh - (diff * ratio)).toFixed(2));
        } else {
            // रेड है तो ऊपर से नीचे (High to Low)
            levels[key] = Number((firstLow + (diff * ratio)).toFixed(2));
        }
    }

    return { isFirstGreen, levels };
}

// ==========================================
// 🟢 मुख्य स्ट्रेटेजी लॉजिक (Fib Only)
// ==========================================
function evaluateSingleStrategy(c, i, candles, strat, options = {}) {
    if (!c) return null;
    const spotPrice = Number(c.close || c.candleClose || c.price || c.ltp || 0);
    if (!spotPrice || isNaN(spotPrice) || spotPrice <= 0) return null;

    let signalType = "NONE";
    let customSl = null;
    let strategyReason = "";

    // उस दिन की सारी कैंडल्स निकालें
    const todayCandles = candles.filter(x => x.date === c.date);

    // अगर पहली कैंडल है या कोई कैंडल नहीं है, तो वेट करें
    if (todayCandles.length >= 2) {
        const firstCandle = todayCandles[0];
        const { isFirstGreen, levels } = calculateFibLevels(firstCandle);

        const lvl44 = levels["0.44"];
        const lvl50 = levels["0.50"];
        const lvl56 = levels["0.56"];

        const currentClose = Number(c.close || c.candleClose);
        const currentOpen = Number(c.open || c.candleOpen);
        const isCurrentGreen = currentClose > currentOpen;

        const prevCandle = todayCandles[todayCandles.length - 2];
        const prevClose = Number(prevCandle.close || prevCandle.candleClose);

        // टॉलरेंस (स्ट्रेटेजी में सेट कर सकते हैं, डिफॉल्ट 5)
        const tolerance = strat.indicators?.fibTolerance || 5;

        // 🟢 BUY (कॉल) का लॉजिक
        if (strat.rules.buy && strat.rules.buy.some(r => r.target === "fibonacci" || r.target === "fib")) {
            if (isFirstGreen) {
                const isNearSupport = (Number(c.low) <= (lvl56 + tolerance) && currentClose > lvl56);
                if (isNearSupport && isCurrentGreen) {
                    signalType = "BUY";
                    customSl = lvl56; // नीचे वाली लाइन का SL
                    strategyReason = `Fib Support (0.56) Bounce`;
                }
                else if (currentClose > lvl44 && prevClose <= lvl44) {
                    signalType = "BUY";
                    customSl = lvl50;
                    strategyReason = `Fib Breakout (Above 0.44)`;
                }
            }
        }

        // 🔴 SELL (पुट) का लॉजिक
        if (strat.rules.sell && strat.rules.sell.some(r => r.target === "fibonacci" || r.target === "fib")) {
            if (!isFirstGreen) {
                const isNearResistance = (Number(c.high) >= (lvl44 - tolerance) && currentClose < lvl44);
                if (isNearResistance && !isCurrentGreen) {
                    signalType = "SELL";
                    customSl = lvl44; // ऊपर वाली लाइन का SL
                    strategyReason = `Fib Resistance (0.44) Rejection`;
                }
                else if (currentClose < lvl56 && prevClose >= lvl56) {
                    signalType = "SELL";
                    customSl = lvl50;
                    strategyReason = `Fib Breakdown (Below 0.56)`;
                }
            }
        }
    }

    if (signalType !== "NONE") {
        let sl, tp;
        // SL हमेशा फिब लाइन पर होगा, और TP 1:2 जोखिम पर
        if (customSl !== null) {
            sl = customSl;
            const risk = Math.abs(spotPrice - sl);
            tp = signalType === "BUY" ? spotPrice + (risk * 2) : spotPrice - (risk * 2);
        } else {
            // फॉलबैक (अगर कभी लाइन न मिले, जो कि नहीं होना चाहिए)
            const slPts = 10;
            sl = signalType === "BUY" ? spotPrice - slPts : spotPrice + slPts;
            tp = signalType === "BUY" ? spotPrice + (slPts * 2) : spotPrice - (slPts * 2);
        }

        return {
            strategyId: strat.id,
            strategyName: strat.name,
            type: signalType,
            entry: Number(spotPrice.toFixed(2)),
            sl: Number(sl.toFixed(2)),
            tr: Number(tp.toFixed(2)),
            confidence: strat.winrate || "70.0%",
            reason: strategyReason || `🟢 Fib Rules Met (${signalType})`
        };
    }

    return null;
}

function consolidateSignals(signals, minVotes = 1) {
    let buyCount = 0, sellCount = 0;
    let topBuySignal = null, topSellSignal = null;

    for (const sig of signals) {
        if (sig.type === "BUY") {
            buyCount++;
            if (!topBuySignal || parseFloat(sig.confidence || "0") > parseFloat(topBuySignal.confidence || "0")) topBuySignal = sig;
        } else if (sig.type === "SELL") {
            sellCount++;
            if (!topSellSignal || parseFloat(sig.confidence || "0") > parseFloat(topSellSignal.confidence || "0")) topSellSignal = sig;
        }
    }

    let finalConsensus = "NO_SIGNAL";
    let chosenSignal = null;

    if (buyCount >= minVotes && buyCount > sellCount && topBuySignal) {
        finalConsensus = "BUY";
        chosenSignal = topBuySignal;
    } else if (sellCount >= minVotes && sellCount > buyCount && topSellSignal) {
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
        minVotesRequired: minVotes,
        buyVotes: buyCount,
        sellVotes: sellCount
    };
}

// ==========================================
// 🚀 मुख्य इंजन (Auto-Warmup के साथ)
// ==========================================
async function evaluateConsensusEngine(inputCandles = [], i = -1, options = {}) {
    let candlesArray = [];
    let opts = {};
    let candleIndex = i;

    if (typeof inputCandles === "object" && inputCandles !== null && !Array.isArray(inputCandles) && inputCandles.close === undefined && inputCandles.open === undefined) {
        opts = { ...inputCandles };
        candleIndex = -1;
    } else {
        candlesArray = Array.isArray(inputCandles) ? [...inputCandles] : (inputCandles ? [inputCandles] : []);
        opts = { ...options };
        candleIndex = i;
    }

    const config = loadStrategyConfig("consensus_master_head.json");
    const warmupCount = (opts.warmupCount !== undefined ? Number(opts.warmupCount) : (config.warmupCount !== undefined ? Number(config.warmupCount) : 200));

    if (candlesArray.length < warmupCount) {
        const lastCandle = candlesArray.length > 0 ? candlesArray[candlesArray.length - 1] : null;
        const now = new Date();
        const defaultDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const defaultTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

        const targetDate = opts.date || (lastCandle ? lastCandle.date : defaultDate);
        const targetTime = opts.time || (lastCandle ? lastCandle.time : defaultTime);
        const securityId = opts.securityId || (lastCandle ? (lastCandle.securityId || lastCandle.symbol) : null) || "13";
        const exchangeSegment = opts.exchangeSegment || (lastCandle ? lastCandle.exchangeSegment : null) || "IDX_I";
        const interval = String(opts.interval || (lastCandle ? lastCandle.interval : null) || "15");

        if (targetDate) {
            try {
                const warmupRes = await getCachedCandles({
                    securityId: String(securityId),
                    exchangeSegment,
                    interval: String(interval),
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

    if (candlesArray.length === 0) {
        return { consensus: "NO_SIGNAL", type: "NO_SIGNAL", triggeredSignals: [] };
    }

    return evaluateConsensusEngineSync(candlesArray, candleIndex, opts);
}

function evaluateConsensusEngineSync(candlesArray, i = -1, options = {}) {
    if (!candlesArray || !Array.isArray(candlesArray) || candlesArray.length < 1) {
        return { consensus: "NO_SIGNAL", type: "NO_SIGNAL", triggeredSignals: [], reason: "INSUFFICIENT_CANDLE_HISTORY" };
    }

    const index = (i < 0) ? candlesArray.length - 1 : i;
    if (index < 0 || index >= candlesArray.length) {
        return { consensus: "NO_SIGNAL", type: "NO_SIGNAL", triggeredSignals: [] };
    }

    const config = loadStrategyConfig("consensus_master_head.json");
    const strategies = resolveAllStrategies(config);
    const activeGroupMinVotes = strategies.find(s => s.groupMinVotes !== undefined)?.groupMinVotes;
    const minVotes = Number(options.minVotes !== undefined ? options.minVotes : (activeGroupMinVotes !== undefined ? activeGroupMinVotes : (config.minStrategyVotes !== undefined ? config.minStrategyVotes : 1)));

    const c = candlesArray[index];
    const processedCandle = c ? {
        index: index + 1,
        date: c.date,
        time: c.time,
        open: Number(c.open || c.candleOpen || c.close || 0),
        high: Number(c.high || c.candleHigh || c.close || 0),
        low: Number(c.low || c.candleLow || c.close || 0),
        close: Number(c.close || c.candleClose || c.price || 0),
        volume: Number(c.volume || c.candleVolume || 0)
    } : null;

    const triggeredSignals = [];
    const strategyStates = [];

    for (const strat of strategies) {
        if (strat.enabled === false) continue;
        const res = evaluateSingleStrategy(c, index, candlesArray, strat, options);

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
                reason: res.reason || `🟢 Fib Entry Met (${res.type})`
            });
        } else {
            strategyStates.push({
                strategyId: strat.id,
                strategyName: strat.name,
                triggered: false,
                vote: "NEUTRAL",
                confidence: strat.winrate || "70.0%",
                entry: null,
                sl: null,
                tr: null,
                reason: "Waiting for Fib Setup"
            });
        }
    }

    const result = consolidateSignals(triggeredSignals, minVotes);
    result.strategyStates = strategyStates;
    result.warmupCandleCount = candlesArray.length;
    result.evaluatedCandle = processedCandle;
    result.processedCandle = processedCandle;
    result.candle = processedCandle;
    result.lastCandle = processedCandle || (candlesArray.length > 0 ? candlesArray[candlesArray.length - 1] : null);

    return result;
}

module.exports = {
    evaluateConsensusEngine,
    evaluateConsensusEngineSync,
    evaluateConsensus: evaluateConsensusEngine,
    evaluateSingleConsensusSignal: evaluateConsensusEngine,
    loadStrategyConfig
};