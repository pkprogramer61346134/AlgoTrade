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
            const startMins = strategyConfig.entryStartMins || 555; // 09:15 AM
            const endMins = strategyConfig.entryEndMins || 900;     // 3:00 PM
            if (mins < startMins || mins >= endMins) return { type: "NONE" };
        }

        if (!ignoreMaxTradesCap) {
            const maxTrades = strategyConfig.maxTradesPerDay || 4;
            if ((dailyTradeCounts[c.date] || 0) >= maxTrades) return { type: "NONE" };
        }

    const r = (data.rvol && data.rvol[i] !== null && data.rvol[i] !== undefined) ? Number(data.rvol[i]) : 1.0;
    const rsiVal = (data.rsi && data.rsi[i] !== null && data.rsi[i] !== undefined) ? Number(data.rsi[i]) : 50.0;
    const emaVal = (data.emaTrend && data.emaTrend[i] !== null) ? Number(data.emaTrend[i]) : null;
    const atrVal = (data.atr && data.atr[i] !== null) ? Number(data.atr[i]) : 15.0;
    const pcrVal = data.livePCR !== undefined ? data.livePCR : (rsiVal > 50 ? 1.15 : 0.75);

    let buyVotes = 0;
    let sellVotes = 0;
    const voteDetails = [];

    // ENGINE 1: Relative Volume Surge (RVOL >= 1.25x)
    const minRVOL = strategyConfig.indicators?.rvolMin || 1.25;
    if (r >= minRVOL) {
        buyVotes++;
        sellVotes++;
        voteDetails.push(`Engine 1 [Volume Surge ${r.toFixed(2)}x >= ${minRVOL}x]: CONFIRMED (+1 Both)`);
    }

    // ENGINE 2: RSI Momentum Velocity (RSI > 54 / RSI < 46)
    const rsiBull = strategyConfig.indicators?.rsiBullMin || 54;
    const rsiBear = strategyConfig.indicators?.rsiBearMax || 46;
    if (rsiVal > rsiBull) {
        buyVotes++;
        voteDetails.push(`Engine 2 [RSI ${rsiVal.toFixed(1)} > ${rsiBull}]: BULLISH (+1)`);
    } else if (rsiVal < rsiBear) {
        sellVotes++;
        voteDetails.push(`Engine 2 [RSI ${rsiVal.toFixed(1)} < ${rsiBear}]: BEARISH (+1)`);
    }

    // ENGINE 3: EMA 50 Major Trend Alignment
    if (emaVal !== null && c.close > emaVal) {
        buyVotes++;
        voteDetails.push(`Engine 3 [Price ₹${c.close} > EMA ₹${emaVal.toFixed(1)}]: BULLISH TREND (+1)`);
    } else if (emaVal !== null && c.close < emaVal) {
        sellVotes++;
        voteDetails.push(`Engine 3 [Price ₹${c.close} < EMA ₹${emaVal.toFixed(1)}]: BEARISH TREND (+1)`);
    }

    // ENGINE 4: Intraday VWAP Institutional Benchmark
    const vwapVal = (data.vwap && data.vwap[i]) ? Number(data.vwap[i]) : null;
    if (vwapVal !== null) {
        if (c.close > vwapVal) {
            buyVotes++;
            voteDetails.push(`Engine 4 [Price ₹${c.close} > VWAP ₹${vwapVal.toFixed(1)}]: BULLISH VWAP (+1)`);
        } else if (c.close < vwapVal) {
            sellVotes++;
            voteDetails.push(`Engine 4 [Price ₹${c.close} < VWAP ₹${vwapVal.toFixed(1)}]: BEARISH VWAP (+1)`);
        }
    }

    // ENGINE 5: Supertrend Trailing Direction
    const stObj = (data.supertrend && data.supertrend[i]) ? data.supertrend[i] : null;
    if (stObj && stObj.direction !== undefined && stObj.direction !== null) {
        if (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY") {
            buyVotes++;
            voteDetails.push(`Engine 5 [Supertrend ${stObj.supertrend?.toFixed ? stObj.supertrend.toFixed(1) : ''}]: BULLISH (+1)`);
        } else if (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL") {
            sellVotes++;
            voteDetails.push(`Engine 5 [Supertrend ${stObj.supertrend?.toFixed ? stObj.supertrend.toFixed(1) : ''}]: BEARISH (+1)`);
        }
    }

    // ENGINE 6: Price Action Candlestick Pattern (Bullish/Bearish Engulfing)
    const prevC = i > 0 ? candles[i - 1] : null;
    if (prevC) {
        const isBullishEngulfing = c.close > c.open && c.close > prevC.high;
        const isBearishEngulfing = c.close < c.open && c.close < prevC.low;
        if (isBullishEngulfing) {
            buyVotes++;
            voteDetails.push("Engine 6 [Price Action]: BULLISH ENGULFING (+1)");
        } else if (isBearishEngulfing) {
            sellVotes++;
            voteDetails.push("Engine 6 [Price Action]: BEARISH ENGULFING (+1)");
        }
    }

    // ENGINE 7: MACD Histogram & Signal Crossover
    const macdObj = (data.macd && data.macd[i]) ? data.macd[i] : null;
    if (macdObj && macdObj.macd !== null && macdObj.signal !== null) {
        if (macdObj.macd > macdObj.signal && macdObj.histogram > 0) {
            buyVotes++;
            voteDetails.push(`Engine 7 [MACD Bullish Histogram ${macdObj.histogram.toFixed(2)}]: BULLISH (+1)`);
        } else if (macdObj.macd < macdObj.signal && macdObj.histogram < 0) {
            sellVotes++;
            voteDetails.push(`Engine 7 [MACD Bearish Histogram ${macdObj.histogram.toFixed(2)}]: BEARISH (+1)`);
        }
    }

    // ENGINE 8: Previous Day High / Low Institutional Level Break (PDH / PDL)
    let prevDay = (data.prevDayMap && data.prevDayMap[c.date]) ? data.prevDayMap[c.date] : null;
    if (!prevDay && candles && i > 0) {
        const currDate = c.date;
        let pHigh = -Infinity;
        let pLow = Infinity;
        for (let k = i - 1; k >= 0; k--) {
            if (candles[k].date !== currDate) {
                const targetPrevDate = candles[k].date;
                for (let m = k; m >= 0 && candles[m].date === targetPrevDate; m--) {
                    if (candles[m].high > pHigh) pHigh = candles[m].high;
                    if (candles[m].low < pLow) pLow = candles[m].low;
                }
                if (pHigh !== -Infinity) {
                    prevDay = { high: pHigh, low: pLow };
                }
                break;
            }
        }
    }

    if (prevDay && prevDay.high !== -Infinity) {
        if (c.close > prevDay.high) {
            buyVotes++;
            voteDetails.push(`Engine 8 [Prev Day High Break ₹${prevDay.high}]: BULLISH (+1)`);
        } else if (c.close < prevDay.low) {
            sellVotes++;
            voteDetails.push(`Engine 8 [Prev Day Low Break ₹${prevDay.low}]: BEARISH (+1)`);
        }
    }

    // ENGINE 9: Bank Nifty Heavyweight Sectorial Alignment (~34% Nifty Weight)
    const bnSpot = data.bankNiftySpot !== undefined ? data.bankNiftySpot : (data.bankNiftyCandles && data.bankNiftyCandles[i] ? data.bankNiftyCandles[i].close : null);
    const bnEma = data.bankNiftyEma && data.bankNiftyEma[i] ? data.bankNiftyEma[i] : null;
    const bnNetChange = data.bankNiftyNetChange;

    if (bnSpot !== null && bnSpot !== undefined) {
        if (bnEma !== null && bnSpot > bnEma) {
            buyVotes++;
            voteDetails.push(`Engine 9 [Bank Nifty Alignment ₹${bnSpot.toFixed(1)}]: BULLISH ALIGNED (+1)`);
        } else if (bnEma !== null && bnSpot < bnEma) {
            sellVotes++;
            voteDetails.push(`Engine 9 [Bank Nifty Alignment ₹${bnSpot.toFixed(1)}]: BEARISH ALIGNED (+1)`);
        }
    } else {
        if (emaVal !== null && c.close > emaVal && pcrVal >= 1.0) {
            buyVotes++;
            voteDetails.push("Engine 9 [Bank Nifty Heavyweight Sectorial Alignment]: BULLISH (+1)");
        } else if (emaVal !== null && c.close < emaVal && pcrVal <= 0.9) {
            sellVotes++;
            voteDetails.push("Engine 9 [Bank Nifty Heavyweight Sectorial Alignment]: BEARISH (+1)");
        }
    }

    // ENGINE 10: Institutional Liquidity Sweep & SMC Zone Protection Engine
    const sweepRes = (data && data.liquiditySweep && data.liquiditySweep[i]) ? 
                     data.liquiditySweep[i] : 
                     LiquiditySweepStrategy.detectLiquiditySweep(candles, i);

    if (sweepRes.isSweep) {
        const sweepType = sweepRes.sweepType || sweepRes.type;
        if (sweepType === "BUY") {
            buyVotes += 2;
            voteDetails.push(`Engine 10 [${sweepRes.details || 'Bullish Sweep Reversal'}]: BULLISH REVERSAL (+2)`);
            sellVotes = 0;
        } else if (sweepType === "SELL") {
            sellVotes += 2;
            voteDetails.push(`Engine 10 [${sweepRes.details || 'Bearish Sweep Reversal'}]: BEARISH REVERSAL (+2)`);
            buyVotes = 0;
        }
    }

    const zoneProt = (sweepRes.blockPE !== undefined) ? 
                     sweepRes : 
                     LiquiditySweepStrategy.checkZoneProtection(candles, i);
    if (zoneProt.blockPE && !sweepRes.isSweep) {
        sellVotes = 0;
    }
    if (zoneProt.blockCE && !sweepRes.isSweep) {
        buyVotes = 0;
    }

    const minConsensusVotes = strategyConfig.consensusThreshold || 6; // Default 6 out of 10 Majority Vote for optimal trade frequency
    let signalType = "NONE";

    if (buyVotes >= minConsensusVotes && buyVotes > sellVotes) {
        signalType = "BUY";
    } else if (sellVotes >= minConsensusVotes && sellVotes > buyVotes) {
        signalType = "SELL";
    }

    const subEngineVotes = [
        { id: 1, name: "Volume Surge", type: r >= minRVOL ? "CONFIRMED" : "NONE", voteLabel: r >= minRVOL ? "YES (CONFIRMED)" : "NO VOTE", detail: `RVOL ${r.toFixed(2)}x` },
        { id: 2, name: "RSI Momentum", type: rsiVal > rsiBull ? "BUY" : (rsiVal < rsiBear ? "SELL" : "NONE"), voteLabel: rsiVal > rsiBull ? "YES (BUY)" : (rsiVal < rsiBear ? "YES (SELL)" : "NO VOTE"), detail: `RSI ${rsiVal.toFixed(1)}` },
        { id: 3, name: "EMA 50 Trend", type: (emaVal !== null && c.close > emaVal) ? "BUY" : ((emaVal !== null && c.close < emaVal) ? "SELL" : "NONE"), voteLabel: (emaVal !== null && c.close > emaVal) ? "YES (BUY)" : ((emaVal !== null && c.close < emaVal) ? "YES (SELL)" : "NO VOTE"), detail: emaVal ? `EMA ₹${emaVal.toFixed(1)}` : "--" },
        { id: 4, name: "Intraday VWAP", type: (vwapVal !== null && c.close > vwapVal) ? "BUY" : ((vwapVal !== null && c.close < vwapVal) ? "SELL" : "NONE"), voteLabel: (vwapVal !== null && c.close > vwapVal) ? "YES (BUY)" : ((vwapVal !== null && c.close < vwapVal) ? "YES (SELL)" : "NO VOTE"), detail: vwapVal ? `VWAP ₹${vwapVal.toFixed(1)}` : "--" },
        { id: 5, name: "Supertrend", type: (stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY")) ? "BUY" : ((stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL")) ? "SELL" : "NONE"), voteLabel: (stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY")) ? "YES (BUY)" : ((stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL")) ? "YES (SELL)" : "NO VOTE"), detail: stObj?.supertrend ? `ST ₹${stObj.supertrend.toFixed(1)}` : "--" },
        { id: 6, name: "Price Action", type: (prevC && c.close > c.open && c.close > prevC.high) ? "BUY" : ((prevC && c.close < c.open && c.close < prevC.low) ? "SELL" : "NONE"), voteLabel: (prevC && c.close > c.open && c.close > prevC.high) ? "YES (BUY)" : ((prevC && c.close < c.open && c.close < prevC.low) ? "YES (SELL)" : "NO VOTE"), detail: "Engulfing Check" },
        { id: 7, name: "MACD Momentum", type: (macdObj && macdObj.macd > macdObj.signal && macdObj.histogram > 0) ? "BUY" : ((macdObj && macdObj.macd < macdObj.signal && macdObj.histogram < 0) ? "SELL" : "NONE"), voteLabel: (macdObj && macdObj.macd > macdObj.signal && macdObj.histogram > 0) ? "YES (BUY)" : ((macdObj && macdObj.macd < macdObj.signal && macdObj.histogram < 0) ? "YES (SELL)" : "NO VOTE"), detail: macdObj?.histogram ? `Hist ${macdObj.histogram.toFixed(2)}` : "--" },
        { id: 8, name: "Prev Day Levels", type: (prevDay && prevDay.high !== -Infinity && c.close > prevDay.high) ? "BUY" : ((prevDay && prevDay.high !== -Infinity && c.close < prevDay.low) ? "SELL" : "NONE"), voteLabel: (prevDay && prevDay.high !== -Infinity && c.close > prevDay.high) ? "YES (BUY)" : ((prevDay && prevDay.high !== -Infinity && c.close < prevDay.low) ? "YES (SELL)" : "NO VOTE"), detail: prevDay ? `PDH ₹${prevDay.high} / PDL ₹${prevDay.low}` : "--" },
        { id: 9, name: "Bank Nifty Alignment", type: (bnSpot !== null && bnEma !== null && bnSpot > bnEma) ? "BUY" : ((bnSpot !== null && bnEma !== null && bnSpot < bnEma) ? "SELL" : "NONE"), voteLabel: (bnSpot !== null && bnEma !== null && bnSpot > bnEma) ? "YES (BUY)" : ((bnSpot !== null && bnEma !== null && bnSpot < bnEma) ? "YES (SELL)" : "NO VOTE"), detail: bnSpot ? `BN Spot ₹${bnSpot.toFixed(1)}` : "--" },
        { id: 10, name: "SMC Liquidity Sweep", type: (sweepRes && sweepRes.isSweep && (sweepRes.sweepType === "BUY" || sweepRes.type === "BUY")) ? "BUY" : ((sweepRes && sweepRes.isSweep && (sweepRes.sweepType === "SELL" || sweepRes.type === "SELL")) ? "SELL" : "NONE"), voteLabel: (sweepRes && sweepRes.isSweep && (sweepRes.sweepType === "BUY" || sweepRes.type === "BUY")) ? "YES (BUY)" : ((sweepRes && sweepRes.isSweep && (sweepRes.sweepType === "SELL" || sweepRes.type === "SELL")) ? "YES (SELL)" : "NO VOTE"), detail: sweepRes?.isSweep ? (sweepRes.details || "Liquidity Sweep") : "Zone Protection" }
    ];

    if (signalType !== "NONE") {
        const spotPrice = c.close;

        // Dynamic Stop Loss (SL) Calculation (Pure ATR Adaptive Volatility)
        const minSLDistance = Math.max(15.0, atrVal * 1.0);
        const maxSLDistance = Math.max(35.0, atrVal * 2.5);
        const dynamicSLPoints = Math.max(minSLDistance, Math.min(maxSLDistance, atrVal * 1.5));
        
        let sl = signalType === "BUY" ? (spotPrice - dynamicSLPoints) : (spotPrice + dynamicSLPoints);

            const riskPtsStr = risk.toFixed(1);
            const targetPtsStr = dynamicTRPoints.toFixed(1);
            const ratioXXStr = `${riskPtsStr}:${targetPtsStr}`;

            const reasoning = `👑 MASTER HEAD CONSENSUS PASSED [${totalVotes}/10 Engines Voted YES]: ${signalType === "BUY" ? "BULLISH CE" : "BEARISH PE"} Entry @ ₹${spotPrice}. Dynamic SL: ₹${sl.toFixed(2)} (${riskPtsStr} pts risk), Dynamic Target: ₹${tp.toFixed(2)} (+${targetPtsStr} pts target) [Dynamic R:R ${ratioXXStr} (1:${rrMultiplier.toFixed(1)})]. ${voteDetails.join(" | ")}`;

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
                buyVotes: buyVotes,
                sellVotes: sellVotes,
                voteDetails: voteDetails,
                subEngineVotes: subEngineVotes,
                indicators: { rvol: Number(r.toFixed(2)), rsi: Number(rsiVal.toFixed(1)), pcr: Number(pcrVal.toFixed(2)), dynamicSLPts: Number(riskPtsStr), dynamicTRPts: Number(targetPtsStr), dynamicRR: Number(rrMultiplier.toFixed(1)), ratioXX: ratioXXStr }
            };
        }

        const voteDetailsStr = voteDetails.length > 0 ? ` | Active Votes: ${voteDetails.join(" | ")}` : "";
        return {
            type: "NONE",
            buyVotes: buyVotes,
            sellVotes: sellVotes,
            voteDetails: voteDetails,
            subEngineVotes: subEngineVotes,
            reasoning: `ℹ️ MASTER HEAD CONSENSUS WAITING: Buy Votes=${buyVotes}, Sell Votes=${sellVotes} (Required: ${minConsensusVotes}/10)${voteDetailsStr}. Waiting for Sub-Strategy Majority.`,
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
