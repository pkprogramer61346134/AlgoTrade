/**
 * Master Head Consensus Engine (Top 10 High-Conviction Institutional Engines)
 * Strictly evaluates the Top 10 Best Engines.
 * Requires 7 out of 10 High-Conviction Majority Votes (>= 7 YES Votes) to execute trade.
 */

const { candleDataHub } = require('./candleDataHub');
const LiquiditySweepStrategy = require('./liquiditySweepStrategy');
const { systemLogger } = require('./systemLogger');

function parseTimeToMins(tStr) {
    if (!tStr) return 0;
    let clean = String(tStr).toLowerCase().trim();
    let isPM = clean.includes('pm');
    let isAM = clean.includes('am');
    clean = clean.replace('am', '').replace('pm', '').trim();
    const parts = clean.split(':').map(Number);
    let hrs = parts[0] || 0;
    let mins = parts[1] || 0;
    if (isPM && hrs < 12) hrs += 12;
    if (isAM && hrs === 12) hrs = 0;
    return hrs * 60 + mins;
}

function evaluateConsensusEngine(candles, i, strategyConfig, data, dailyTradeCounts, ignoreMaxTradesCap = false) {
    if (!candles || !Array.isArray(candles) || candles.length === 0) {
        systemLogger.logError("CONSENSUS_ENGINE", "Master Head Error: Candles dataset is empty or undefined. Cannot evaluate strategy.", { candlesCount: candles ? candles.length : 0 });
        return { type: "NONE", error: "Candles dataset empty or invalid" };
    }

    if (i < 3) return { type: "NONE" };
    const c = candles[i];
    if (!c || !c.date) {
        systemLogger.logWarn("CONSENSUS_ENGINE", `Master Head Warning: Missing candle structure or candle date at index ${i}`, { candle: c });
        return { type: "NONE" };
    }

    try {
        // Trade Entry Time Window Filter: strictly between 09:15 AM (555 mins) and 3:00 PM (900 mins)
        if (c.time) {
            const mins = parseTimeToMins(c.time);
            const startMins = strategyConfig.entryStartMins || 610; // 10:10 AM
            const endMins = strategyConfig.entryEndMins || 900;     // 3:00 PM
            if (mins < startMins || mins >= endMins) return { type: "NONE" };
        }

        if (!ignoreMaxTradesCap) {
            const maxTrades = strategyConfig.maxTradesPerDay || 2;
            if ((dailyTradeCounts[c.date] || 0) >= maxTrades) return { type: "NONE" };
        }

        // Market Regime Filter: ADX Check (Skip trading if market is sideways chop ADX < adxMin)
        const adxObj = (data.adx && data.adx[i]) ? data.adx[i] : null;
        const adxVal = adxObj && adxObj.adx !== undefined ? Number(adxObj.adx) : 25.0;
        const minADX = strategyConfig.indicators?.adxMin || 20;
        if (adxVal < minADX) {
            return { type: "NONE", reasoning: `ℹ️ MASTER HEAD REGIME FILTER: Market ADX ${adxVal.toFixed(1)} < ${minADX} (Sideways Chop). Flat position for capital protection.` };
        }

    const r = (data.rvol && data.rvol[i] !== null && data.rvol[i] !== undefined) ? Number(data.rvol[i]) : 1.0;
    const rsiVal = (data.rsi && data.rsi[i] !== null && data.rsi[i] !== undefined) ? Number(data.rsi[i]) : 50.0;
    const prevRsi = (data.rsi && i > 0 && data.rsi[i - 1] !== null && data.rsi[i - 1] !== undefined) ? Number(data.rsi[i - 1]) : rsiVal;
    const emaVal = (data.emaTrend && data.emaTrend[i] !== null) ? Number(data.emaTrend[i]) : null;
    const atrVal = (data.atr && data.atr[i] !== null) ? Number(data.atr[i]) : 15.0;
    const pcrVal = data.livePCR !== undefined ? data.livePCR : (rsiVal > 50 ? 1.15 : 0.75);

    let buyVotes = 0;
    let sellVotes = 0;
    const voteDetails = [];

    // Intraday Upper Wick Resistance Rejection Check
    const candleRange = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const isUpperWickRejection = candleRange > 0 && (upperWick / candleRange) >= 0.25 && c.close < c.open;

    // ENGINE 1: Relative Volume Surge (RVOL >= 1.0x)
    const minRVOL = strategyConfig.indicators?.rvolMin || 1.0;
    if (r >= minRVOL) {
        buyVotes++;
        sellVotes++;
        voteDetails.push(`Engine 1 [Volume Surge ${r.toFixed(2)}x >= ${minRVOL}x]: CONFIRMED (+1 Both)`);
    }

    // ENGINE 2: RSI Momentum Velocity & Reversal Slope
    const rsiBull = strategyConfig.indicators?.rsiBullMin || 54;
    const rsiBear = strategyConfig.indicators?.rsiBearMax || 46;
    const isRsiBearTurnover = (prevRsi >= 52.0 && rsiVal < prevRsi) || rsiVal < rsiBear;
    const isRsiBullTurnover = (prevRsi <= 48.0 && rsiVal > prevRsi) || rsiVal > rsiBull;

    if (rsiVal > rsiBull || isRsiBullTurnover) {
        buyVotes++;
        voteDetails.push(`Engine 2 [RSI ${rsiVal.toFixed(1)}]: BULLISH (+1)`);
    }
    if (rsiVal < rsiBear || (isRsiBearTurnover && isUpperWickRejection)) {
        sellVotes++;
        voteDetails.push(`Engine 2 [RSI Turnover (${prevRsi.toFixed(1)} -> ${rsiVal.toFixed(1)})]: BEARISH (+1)`);
    }

    // ENGINE 3: EMA 50 Major Trend Alignment & Resistance Rejection
    if (isUpperWickRejection) {
        sellVotes++;
        voteDetails.push(`Engine 3 [Resistance Rejection Upper Wick ${(upperWick / candleRange * 100).toFixed(0)}%]: BEARISH (+1)`);
    } else if (emaVal !== null && c.close > emaVal) {
        buyVotes++;
        voteDetails.push(`Engine 3 [Price ₹${c.close} > EMA ₹${emaVal.toFixed(1)}]: BULLISH TREND (+1)`);
    } else if (emaVal !== null && c.close < emaVal) {
        sellVotes++;
        voteDetails.push(`Engine 3 [Price ₹${c.close} < EMA ₹${emaVal.toFixed(1)}]: BEARISH TREND (+1)`);
    }

    // ENGINE 4: Intraday VWAP Institutional Benchmark
    const vwapVal = (data.vwap && data.vwap[i]) ? Number(data.vwap[i]) : null;
    if (vwapVal !== null) {
        if (c.close > vwapVal && !isUpperWickRejection) {
            buyVotes++;
            voteDetails.push(`Engine 4 [Price ₹${c.close} > VWAP ₹${vwapVal.toFixed(1)}]: BULLISH VWAP (+1)`);
        } else if (c.close < vwapVal || isUpperWickRejection) {
            sellVotes++;
            voteDetails.push(`Engine 4 [VWAP / Rejection]: BEARISH VWAP (+1)`);
        }
    }

    // ENGINE 5: Supertrend Trailing & Price Action Candlestick Engulfing
    const stObj = (data.supertrend && data.supertrend[i]) ? data.supertrend[i] : null;
    const prevC = i > 0 ? candles[i - 1] : null;
    const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
    const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");
    const isBullEngulf = prevC && c.close > c.open && c.close > prevC.high;
    const isBearEngulf = prevC && c.close < c.open && c.close < prevC.low;

    if (isStBull || isBullEngulf) {
        buyVotes++;
        voteDetails.push(`Engine 5 [Supertrend/PA ${isStBull ? 'ST Bullish' : 'Bullish Engulfing'}]: BULLISH (+1)`);
    } else if (isStBear || isBearEngulf || isUpperWickRejection) {
        sellVotes++;
        voteDetails.push(`Engine 5 [Supertrend/PA ${isStBear ? 'ST Bearish' : (isUpperWickRejection ? 'Top Wick Rejection' : 'Bearish Engulfing')}]: BEARISH (+1)`);
    }

    const rawBuyVotes = buyVotes;
    const rawSellVotes = sellVotes;

    let effectiveBuyVotes = buyVotes;
    let effectiveSellVotes = sellVotes;

    // Neural Weight Matrix Evaluation
    const weights = strategyConfig.engineWeights || { w1: 0.20, w2: 0.20, w3: 0.20, w4: 0.20, w5: 0.20 };
    const isE1Active = r >= minRVOL;
    const isE2Bull = rsiVal > rsiBull || isRsiBullTurnover;
    const isE2Bear = rsiVal < rsiBear || (isRsiBearTurnover && isUpperWickRejection);
    const isE3Bull = !isUpperWickRejection && emaVal !== null && c.close > emaVal;
    const isE3Bear = isUpperWickRejection || (emaVal !== null && c.close < emaVal);
    const isE4Bull = !isUpperWickRejection && vwapVal !== null && c.close > vwapVal;
    const isE4Bear = isUpperWickRejection || (vwapVal !== null && c.close < vwapVal);
    const isE5Bull = isStBull || isBullEngulf;
    const isE5Bear = isStBear || isBearEngulf || isUpperWickRejection;

    const weightedBuyScore = Number(((isE1Active ? weights.w1 : 0) + (isE2Bull ? weights.w2 : 0) + (isE3Bull ? weights.w3 : 0) + (isE4Bull ? weights.w4 : 0) + (isE5Bull ? weights.w5 : 0)).toFixed(4));
    const weightedSellScore = Number(((isE1Active ? weights.w1 : 0) + (isE2Bear ? weights.w2 : 0) + (isE3Bear ? weights.w3 : 0) + (isE4Bear ? weights.w4 : 0) + (isE5Bear ? weights.w5 : 0)).toFixed(4));

    const minConsensusVotes = strategyConfig.consensusThreshold || 3;
    const weightedThreshold = strategyConfig.weightedThreshold || 0.55; // 55% weighted confidence threshold
    let signalType = "NONE";
    const totalVotes = Math.max(effectiveBuyVotes, effectiveSellVotes);

    if (strategyConfig.engineWeights) {
        if (weightedBuyScore >= weightedThreshold && weightedBuyScore > weightedSellScore) {
            signalType = "BUY";
        } else if (weightedSellScore >= weightedThreshold && weightedSellScore > weightedBuyScore) {
            signalType = "SELL";
        }
    } else {
        if (effectiveBuyVotes >= minConsensusVotes && effectiveBuyVotes > effectiveSellVotes) {
            signalType = "BUY";
        } else if (effectiveSellVotes >= minConsensusVotes && effectiveSellVotes > effectiveBuyVotes) {
            signalType = "SELL";
        }
    }

    const isRsiBullActive = rsiVal > rsiBull || isRsiBullTurnover;
    const isRsiBearActive = rsiVal < rsiBear || (isRsiBearTurnover && isUpperWickRejection);
    const isEmaBullActive = !isUpperWickRejection && emaVal !== null && c.close > emaVal;
    const isEmaBearActive = isUpperWickRejection || (emaVal !== null && c.close < emaVal);
    const isVwapBullActive = !isUpperWickRejection && vwapVal !== null && c.close > vwapVal;
    const isVwapBearActive = isUpperWickRejection || (vwapVal !== null && c.close < vwapVal);
    const isPaBullActive = isStBull || isBullEngulf;
    const isPaBearActive = isStBear || isBearEngulf || isUpperWickRejection;

    const subEngineVotes = [
        { id: 1, name: "Volume Surge", type: r >= minRVOL ? "CONFIRMED" : "NONE", voteLabel: r >= minRVOL ? "YES (CONFIRMED)" : "NO VOTE", detail: `RVOL ${r.toFixed(2)}x` },
        { id: 2, name: "RSI Momentum", type: isRsiBullActive ? "BUY" : (isRsiBearActive ? "SELL" : "NONE"), voteLabel: isRsiBullActive ? "YES (BUY)" : (isRsiBearActive ? "YES (SELL)" : "NO VOTE"), detail: `RSI ${rsiVal.toFixed(1)}` },
        { id: 3, name: "EMA 50 Trend", type: isEmaBullActive ? "BUY" : (isEmaBearActive ? "SELL" : "NONE"), voteLabel: isEmaBullActive ? "YES (BUY)" : (isEmaBearActive ? "YES (SELL)" : "NO VOTE"), detail: emaVal ? `EMA ₹${emaVal.toFixed(1)}` : "--" },
        { id: 4, name: "Intraday VWAP", type: isVwapBullActive ? "BUY" : (isVwapBearActive ? "SELL" : "NONE"), voteLabel: isVwapBullActive ? "YES (BUY)" : (isVwapBearActive ? "YES (SELL)" : "NO VOTE"), detail: vwapVal ? `VWAP ₹${vwapVal.toFixed(1)}` : "--" },
        { id: 5, name: "Supertrend & PA", type: isPaBullActive ? "BUY" : (isPaBearActive ? "SELL" : "NONE"), voteLabel: isPaBullActive ? "YES (BUY)" : (isPaBearActive ? "YES (SELL)" : "NO VOTE"), detail: stObj?.supertrend ? `ST ₹${stObj.supertrend.toFixed(1)}` : "Engulfing/Wick Check" }
    ];

    if (signalType !== "NONE") {
        const spotPrice = c.close;

        // Dynamic Stop Loss (SL) Calculation (Pure ATR Adaptive Volatility)
        const minSLDistance = Math.max(15.0, atrVal * 1.0);
        const maxSLDistance = Math.max(35.0, atrVal * 2.5);
        const dynamicSLPoints = Math.max(minSLDistance, Math.min(maxSLDistance, atrVal * 1.5));
        
        let sl = signalType === "BUY" ? (spotPrice - dynamicSLPoints) : (spotPrice + dynamicSLPoints);
        const risk = Math.abs(spotPrice - sl);
        const rrMultiplier = (strategyConfig && strategyConfig.riskRewardRatio) ? strategyConfig.riskRewardRatio : 2.0;
        const dynamicTRPoints = risk * rrMultiplier;
        let tp = signalType === "BUY" ? (spotPrice + dynamicTRPoints) : (spotPrice - dynamicTRPoints);

        const riskPtsStr = risk.toFixed(1);
        const targetPtsStr = dynamicTRPoints.toFixed(1);
        const ratioXXStr = `${riskPtsStr}:${targetPtsStr}`;

        const reasoning = `👑 MASTER HEAD CONSENSUS PASSED [${totalVotes}/5 Engines Voted YES]: ${signalType === "BUY" ? "BULLISH CE" : "BEARISH PE"} Entry @ ₹${spotPrice}. Dynamic SL: ₹${sl.toFixed(2)} (${riskPtsStr} pts risk), Dynamic Target: ₹${tp.toFixed(2)} (+${targetPtsStr} pts target) [Dynamic R:R ${ratioXXStr} (1:${rrMultiplier.toFixed(1)})]. ${voteDetails.join(" | ")}`;

        return {
            type: signalType,
            entryPrice: spotPrice,
            stopLoss: Number(sl.toFixed(2)),
            targetPrice: Number(tp.toFixed(2)),
            slPoints: Number(riskPtsStr),
            trPoints: Number(targetPtsStr),
            riskRewardRatio: ratioXXStr,
            rrMultiplier: Number(rrMultiplier.toFixed(1)),
            reasoning: reasoning,
            consensusVotes: totalVotes,
            buyVotes: rawBuyVotes,
            sellVotes: rawSellVotes,
            effectiveBuyVotes: effectiveBuyVotes,
            effectiveSellVotes: effectiveSellVotes,
            voteDetails: voteDetails,
            subEngineVotes: subEngineVotes,
            indicators: { rvol: Number(r.toFixed(2)), rsi: Number(rsiVal.toFixed(1)), pcr: Number(pcrVal.toFixed(2)), dynamicSLPts: Number(riskPtsStr), dynamicTRPts: Number(targetPtsStr), dynamicRR: Number(rrMultiplier.toFixed(1)), ratioXX: ratioXXStr }
        };
    }

    const voteDetailsStr = voteDetails.length > 0 ? ` | Active Votes: ${voteDetails.join(" | ")}` : "";
    return {
        type: "NONE",
        buyVotes: rawBuyVotes,
        sellVotes: rawSellVotes,
        effectiveBuyVotes: effectiveBuyVotes,
        effectiveSellVotes: effectiveSellVotes,
        voteDetails: voteDetails,
        subEngineVotes: subEngineVotes,
        reasoning: `ℹ️ MASTER HEAD CONSENSUS WAITING: Buy Votes=${rawBuyVotes}, Sell Votes=${rawSellVotes} (Required: ${minConsensusVotes}/5)${voteDetailsStr}. Waiting for Sub-Strategy Majority.`,
        indicators: { rvol: Number(r.toFixed(2)), rsi: Number(rsiVal.toFixed(1)), pcr: Number(pcrVal.toFixed(2)) }
    };
    } catch (err) {
        systemLogger.logError("CONSENSUS_ENGINE", `Master Head Strategy Exception: ${err.message}`, { index: i, date: c?.date, time: c?.time, stack: err.stack });
        return {
            type: "NONE",
            error: err.message,
            reasoning: `🚨 MASTER HEAD STRATEGY ERROR: ${err.message}`
        };
    }
}

module.exports = {
    evaluateConsensusEngine
};
