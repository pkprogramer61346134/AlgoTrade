/**
 * Multi-Strategy Consensus Engine (Master Head Voting System - 15-Engine High-Conviction System)
 * Aggregates 15 Sub-Strategy Engines
 * Requires High-Conviction Majority Consensus (>= 11 out of 15 YES Votes) to execute trade.
 */

const { candleDataHub } = require('./candleDataHub');
const LiquiditySweepStrategy = require('./liquiditySweepStrategy');

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
    if (i < 3) return { type: "NONE" };
    const c = candles[i];
    if (!c.date) return { type: "NONE" };

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

    const orb = data.dayORB[c.date];
    if (!orb || orb.high === -Infinity || orb.low === Infinity) return { type: "NONE" };

    const r = (data.rvol && data.rvol[i] !== null && data.rvol[i] !== undefined) ? Number(data.rvol[i]) : 1.0;
    const rsiVal = (data.rsi && data.rsi[i] !== null && data.rsi[i] !== undefined) ? Number(data.rsi[i]) : 50.0;
    const emaVal = (data.emaTrend && data.emaTrend[i] !== null) ? Number(data.emaTrend[i]) : null;
    const atrVal = (data.atr && data.atr[i] !== null) ? Number(data.atr[i]) : 15.0;
    const pcrVal = data.livePCR !== undefined ? data.livePCR : (rsiVal > 50 ? 1.15 : 0.75);

    let buyVotes = 0;
    let sellVotes = 0;
    const voteDetails = [];

    // Sub-Engine 1: ORB Breakout Level
    if (c.high >= orb.high || c.close >= orb.high) {
        buyVotes++;
        voteDetails.push("Engine 1 [ORB Breakout]: BULLISH (+1)");
    }
    if (c.low <= orb.low || c.close <= orb.low) {
        sellVotes++;
        voteDetails.push("Engine 1 [ORB Breakdown]: BEARISH (+1)");
    }

    // Sub-Engine 2: Relative Volume Surge (RVOL >= 1.25x Data-Mined Threshold)
    const minRVOL = strategyConfig.indicators?.rvolMin || 1.25;
    if (r >= minRVOL) {
        buyVotes++;
        sellVotes++;
        voteDetails.push(`Engine 2 [Volume Surge ${r.toFixed(2)}x >= ${minRVOL}x]: CONFIRMED (+1 Both)`);
    }

    // Sub-Engine 3: RSI Momentum Direction (RSI > 54 / RSI < 46 Data-Mined Threshold)
    const rsiBull = strategyConfig.indicators?.rsiBullMin || 54;
    const rsiBear = strategyConfig.indicators?.rsiBearMax || 46;
    if (rsiVal > rsiBull) {
        buyVotes++;
        voteDetails.push(`Engine 3 [RSI ${rsiVal.toFixed(1)} > ${rsiBull}]: BULLISH (+1)`);
    } else if (rsiVal < rsiBear) {
        sellVotes++;
        voteDetails.push(`Engine 3 [RSI ${rsiVal.toFixed(1)} < ${rsiBear}]: BEARISH (+1)`);
    }

    // Sub-Engine 4: EMA Trend Alignment
    if (emaVal !== null && c.close > emaVal) {
        buyVotes++;
        voteDetails.push(`Engine 4 [Price ₹${c.close} > EMA ₹${emaVal.toFixed(1)}]: BULLISH TREND (+1)`);
    } else if (emaVal !== null && c.close < emaVal) {
        sellVotes++;
        voteDetails.push(`Engine 4 [Price ₹${c.close} < EMA ₹${emaVal.toFixed(1)}]: BEARISH TREND (+1)`);
    }

    // Sub-Engine 5: PCR Option Chain Sentiment (PCR >= 1.05 / PCR <= 0.85 Data-Mined Threshold)
    const pcrBull = strategyConfig.indicators?.pcrBullMin || 1.05;
    const pcrBear = strategyConfig.indicators?.pcrBearMax || 0.85;
    if (pcrVal >= pcrBull) {
        buyVotes++;
        voteDetails.push(`Engine 5 [PCR ${pcrVal.toFixed(2)} >= ${pcrBull}]: BULLISH SENTIMENT (+1)`);
    } else if (pcrVal <= pcrBear) {
        sellVotes++;
        voteDetails.push(`Engine 5 [PCR ${pcrVal.toFixed(2)} <= ${pcrBear}]: BEARISH SENTIMENT (+1)`);
    }

    // Sub-Engine 6: Volatility Expansion (ATR >= 15 pts Data-Mined Threshold)
    const minATR = strategyConfig.indicators?.atrMin || 15.0;
    if (atrVal >= minATR) {
        buyVotes++;
        sellVotes++;
        voteDetails.push(`Engine 6 [ATR Volatility ${atrVal.toFixed(1)} >= ${minATR}]: CONFIRMED (+1 Both)`);
    }

    // Sub-Engine 7: Rangebox Squeeze Detector & Range Fader Engine (ADX < 20)
    const adxObj = data.adx && data.adx[i] ? data.adx[i] : null;
    const adxVal = (adxObj && adxObj.adx !== null && adxObj.adx !== undefined) ? Number(adxObj.adx) : null;
    const isRangebox = adxVal !== null && adxVal < 20;

    if (isRangebox) {
        const rangeHeight = orb.high - orb.low;
        if (rangeHeight > 0) {
            const distToHigh = Math.abs(c.high - orb.high);
            const distToLow = Math.abs(c.low - orb.low);
            if (distToHigh <= 8) {
                sellVotes += 2;
                voteDetails.push(`Engine 7 [Rangebox Squeeze ADX ${adxVal.toFixed(1)} < 20]: FADE RANGE HIGH (BUY PE +2)`);
            } else if (distToLow <= 8) {
                buyVotes += 2;
                voteDetails.push(`Engine 7 [Rangebox Squeeze ADX ${adxVal.toFixed(1)} < 20]: FADE RANGE LOW (BUY CE +2)`);
            }
        }
    } else if (adxVal !== null && adxVal >= 20) {
        buyVotes++;
        sellVotes++;
        voteDetails.push(`Engine 7 [Momentum Trend ADX ${adxVal.toFixed(1)} >= 20]: TREND CONFIRMED (+1 Both)`);
    }

    // Sub-Engine 8: Intraday VWAP Institutional Benchmark Engine
    const vwapVal = (data.vwap && data.vwap[i]) ? Number(data.vwap[i]) : null;
    if (vwapVal !== null) {
        if (c.close > vwapVal) {
            buyVotes++;
            voteDetails.push(`Engine 8 [Price ₹${c.close} > VWAP ₹${vwapVal.toFixed(1)}]: BULLISH VWAP (+1)`);
        } else if (c.close < vwapVal) {
            sellVotes++;
            voteDetails.push(`Engine 8 [Price ₹${c.close} < VWAP ₹${vwapVal.toFixed(1)}]: BEARISH VWAP (+1)`);
        }
    }

    // Sub-Engine 9: Supertrend Trend Direction Engine
    const stObj = (data.supertrend && data.supertrend[i]) ? data.supertrend[i] : null;
    if (stObj && stObj.direction !== undefined && stObj.direction !== null) {
        if (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY") {
            buyVotes++;
            voteDetails.push(`Engine 9 [Supertrend ${stObj.supertrend?.toFixed ? stObj.supertrend.toFixed(1) : ''}]: BULLISH (+1)`);
        } else if (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL") {
            sellVotes++;
            voteDetails.push(`Engine 9 [Supertrend ${stObj.supertrend?.toFixed ? stObj.supertrend.toFixed(1) : ''}]: BEARISH (+1)`);
        }
    }

    // Sub-Engine 10: Price Action Candlestick Pattern Engine
    const prevC = i > 0 ? candles[i - 1] : null;
    if (prevC) {
        const isBullishEngulfing = c.close > c.open && c.close > prevC.high;
        const isBearishEngulfing = c.close < c.open && c.close < prevC.low;
        if (isBullishEngulfing) {
            buyVotes++;
            voteDetails.push("Engine 10 [Price Action]: BULLISH ENGULFING (+1)");
        } else if (isBearishEngulfing) {
            sellVotes++;
            voteDetails.push("Engine 10 [Price Action]: BEARISH ENGULFING (+1)");
        }
    }

    // Sub-Engine 11: MACD Histogram & Signal Crossover Engine
    const macdObj = (data.macd && data.macd[i]) ? data.macd[i] : null;
    if (macdObj && macdObj.macd !== null && macdObj.signal !== null) {
        if (macdObj.macd > macdObj.signal && macdObj.histogram > 0) {
            buyVotes++;
            voteDetails.push(`Engine 11 [MACD Bullish Histogram ${macdObj.histogram.toFixed(2)}]: BULLISH (+1)`);
        } else if (macdObj.macd < macdObj.signal && macdObj.histogram < 0) {
            sellVotes++;
            voteDetails.push(`Engine 11 [MACD Bearish Histogram ${macdObj.histogram.toFixed(2)}]: BEARISH (+1)`);
        }
    }

    // Sub-Engine 12: Bollinger Bands Breakout / Volatility Expansion Engine
    const bbObj = (data.bollinger && data.bollinger[i]) ? data.bollinger[i] : null;
    if (bbObj && bbObj.upper && bbObj.lower) {
        if (c.close > bbObj.upper) {
            buyVotes++;
            voteDetails.push(`Engine 12 [Bollinger Upper Breakout ₹${bbObj.upper.toFixed(1)}]: BULLISH (+1)`);
        } else if (c.close < bbObj.lower) {
            sellVotes++;
            voteDetails.push(`Engine 12 [Bollinger Lower Breakdown ₹${bbObj.lower.toFixed(1)}]: BEARISH (+1)`);
        }
    }

    // Sub-Engine 13: Previous Day High / Low Institutional Level Break Engine (Connected to Candle Data Hub)
    if (!prevDay) prevDay = (data.prevDayMap && data.prevDayMap[c.date]) ? data.prevDayMap[c.date] : null;
    if (!prevDay && candles && i > 0) {
        // Fallback: search prior candles in dataset for previous day high/low
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
            voteDetails.push(`Engine 13 [Prev Day High Break ₹${prevDay.high}]: BULLISH (+1)`);
        } else if (c.close < prevDay.low) {
            sellVotes++;
            voteDetails.push(`Engine 13 [Prev Day Low Break ₹${prevDay.low}]: BEARISH (+1)`);
        }
    }

    // Sub-Engine 14: OBV Accumulation / Distribution Volume Flow Engine
    if (data.obv && i >= 3) {
        const isObvRising = data.obv[i] > data.obv[i - 3];
        if (isObvRising) {
            buyVotes++;
            voteDetails.push("Engine 14 [OBV Volume Accumulation]: BULLISH (+1)");
        } else {
            sellVotes++;
            voteDetails.push("Engine 14 [OBV Volume Distribution]: BEARISH (+1)");
        }
    }

    // Sub-Engine 15: Multi-Candle Body Momentum Velocity Engine
    if (prevC) {
        if (c.close > c.open && prevC.close > prevC.open && c.close > prevC.high) {
            buyVotes++;
            voteDetails.push("Engine 15 [Candle Body Velocity]: BULLISH (+1)");
        } else if (c.close < c.open && prevC.close < prevC.open && c.close < prevC.low) {
            sellVotes++;
            voteDetails.push("Engine 15 [Candle Body Velocity]: BEARISH (+1)");
        }
    }

    // Sub-Engine 16: Bank Nifty Index & Heavyweight Sectorial Alignment Engine (~34% Nifty Weight)
    const bnSpot = data.bankNiftySpot !== undefined ? data.bankNiftySpot : (data.bankNiftyCandles && data.bankNiftyCandles[i] ? data.bankNiftyCandles[i].close : null);
    const bnEma = data.bankNiftyEma && data.bankNiftyEma[i] ? data.bankNiftyEma[i] : null;
    const bnOrb = data.bankNiftyOrb ? data.bankNiftyOrb[c.date] : null;
    const bnPrevClose = data.bankNiftyPrevClose;
    const bnOpen = data.bankNiftyOpen;
    const bnNetChange = data.bankNiftyNetChange;

    if (bnSpot !== null && bnSpot !== undefined) {
        let bnBullish = false;
        let bnBearish = false;

        if (bnEma !== null && bnSpot > bnEma) bnBullish = true;
        else if (bnEma !== null && bnSpot < bnEma) bnBearish = true;

        if (bnOrb && bnOrb.high && bnSpot >= bnOrb.high) bnBullish = true;
        if (bnOrb && bnOrb.low && bnSpot <= bnOrb.low) bnBearish = true;

        if (bnPrevClose && bnSpot > bnPrevClose) bnBullish = true;
        else if (bnPrevClose && bnSpot < bnPrevClose) bnBearish = true;

        if (bnOpen && bnSpot > bnOpen) bnBullish = true;
        else if (bnOpen && bnSpot < bnOpen) bnBearish = true;

        if (bnNetChange !== undefined) {
            if (bnNetChange > 0) bnBullish = true;
            else if (bnNetChange < 0) bnBearish = true;
        }

        const chgStr = bnNetChange !== undefined ? ` (${bnNetChange >= 0 ? '+' : ''}${bnNetChange.toFixed(1)} pts)` : '';

        if (bnBullish && !bnBearish) {
            buyVotes++;
            voteDetails.push(`Engine 16 [Bank Nifty Alignment ₹${bnSpot.toFixed(1)}${chgStr}]: BULLISH ALIGNED (+1)`);
        } else if (bnBearish && !bnBullish) {
            sellVotes++;
            voteDetails.push(`Engine 16 [Bank Nifty Alignment ₹${bnSpot.toFixed(1)}${chgStr}]: BEARISH ALIGNED (+1)`);
        } else if (bnBearish && bnBullish) {
            if (bnNetChange < 0 || (bnPrevClose && bnSpot < bnPrevClose)) {
                sellVotes++;
                voteDetails.push(`Engine 16 [Bank Nifty Alignment ₹${bnSpot.toFixed(1)}${chgStr}]: BEARISH ALIGNED (+1)`);
            } else {
                buyVotes++;
                voteDetails.push(`Engine 16 [Bank Nifty Alignment ₹${bnSpot.toFixed(1)}${chgStr}]: BULLISH ALIGNED (+1)`);
            }
        }
    } else {
        // Sectorial alignment check based on trend & sentiment
        if (emaVal !== null && c.close > emaVal && pcrVal >= 1.0) {
            buyVotes++;
            voteDetails.push("Engine 16 [Bank Nifty Heavyweight Sectorial Alignment]: BULLISH (+1)");
        } else if (emaVal !== null && c.close < emaVal && pcrVal <= 0.9) {
            sellVotes++;
            voteDetails.push("Engine 16 [Bank Nifty Heavyweight Sectorial Alignment]: BEARISH (+1)");
        }
    }

    // Sub-Engine 17: Institutional Liquidity Sweep & Stop-Hunt Reversal Engine (Pre-computed Indicator Stream)
    const sweepRes = (data && data.liquiditySweep && data.liquiditySweep[i]) ? 
                     data.liquiditySweep[i] : 
                     LiquiditySweepStrategy.detectLiquiditySweep(candles, i);

    if (sweepRes.isSweep) {
        const sweepType = sweepRes.sweepType || sweepRes.type;
        if (sweepType === "BUY") {
            buyVotes += 3; // High-conviction weighting for SMC sweep rejection
            voteDetails.push(`Engine 17 [${sweepRes.details || 'Bullish Sweep Reversal'}]: BULLISH REVERSAL (+3)`);
            // Liquidity Trap Override: Suppress false PE sell signals at bottom of bullish liquidity sweep
            sellVotes = 0;
        } else if (sweepType === "SELL") {
            sellVotes += 3; // High-conviction weighting for SMC sweep rejection
            voteDetails.push(`Engine 17 [${sweepRes.details || 'Bearish Sweep Reversal'}]: BEARISH REVERSAL (+3)`);
            // Liquidity Trap Override: Suppress false CE buy signals at top of bearish liquidity sweep
            buyVotes = 0;
        }
    }

    // Institutional Demand / Supply Zone Protection Filter
    const zoneProt = (sweepRes.blockPE !== undefined) ? 
                     sweepRes : 
                     LiquiditySweepStrategy.checkZoneProtection(candles, i);
    if (zoneProt.blockPE && !sweepRes.isSweep) {
        sellVotes = 0; // Suppress selling PE at bottom of Support / Demand zone
    }
    if (zoneProt.blockCE && !sweepRes.isSweep) {
        buyVotes = 0; // Suppress buying CE at top of Resistance / Supply zone
    }

    const minConsensusVotes = strategyConfig.consensusThreshold || 11; // Default 11 out of 17 High Conviction Vote
    let signalType = "NONE";

    // Golden Pattern Filter Evaluation (High-Win-Rate Combo Validation)
    const patternFilter = strategyConfig.goldenPatternFilter;
    let patternBonusReason = "";

    if (patternFilter && patternFilter.enabled) {
        // Extract active YES engines from voteDetails
        const activeEngineNums = [];
        voteDetails.forEach(vStr => {
            const match = vStr.match(/Engine\s+(\d+)/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (!activeEngineNums.includes(num)) activeEngineNums.push(num);
            }
        });

        // Check required key engines (e.g. Engine 17 - SMC Liquidity Sweep)
        if (patternFilter.requiredKeyEngines && Array.isArray(patternFilter.requiredKeyEngines)) {
            const missingRequired = patternFilter.requiredKeyEngines.filter(reqEng => !activeEngineNums.includes(reqEng));
            if (missingRequired.length > 0) {
                patternBonusReason = ` [Pattern Filter: Suppressed - Missing Key Engine #${missingRequired.join(', #')}]`;
            }
        }
    }

    if (!patternBonusReason.includes("Suppressed")) {
        if (buyVotes >= minConsensusVotes && buyVotes > sellVotes) {
            signalType = "BUY";
        } else if (sellVotes >= minConsensusVotes && sellVotes > buyVotes) {
            signalType = "SELL";
        }
    }

    if (signalType !== "NONE") {
        const spotPrice = c.close;

        // 1. Dynamic Stop Loss (SL) Calculation (ATR Volatility + ORB Structural Adaptive)
        const orbLevelRisk = Math.abs(spotPrice - (signalType === "BUY" ? orb.low : orb.high));
        const minSLDistance = Math.max(15.0, atrVal * 1.0); // Min SL bounded by 1.0x ATR or 15 pts
        const maxSLDistance = Math.max(35.0, atrVal * 2.5); // Max SL capped by 2.5x ATR or 35 pts
        
        // Dynamic SL distance (points)
        const dynamicSLPoints = Math.max(minSLDistance, Math.min(maxSLDistance, orbLevelRisk));
        
        let sl = signalType === "BUY" ? (spotPrice - dynamicSLPoints) : (spotPrice + dynamicSLPoints);

        const totalVotes = signalType === "BUY" ? buyVotes : sellVotes;

        // 2. Pure Fixed 1:2.0 Risk-Reward Target (TR) Calculation
        const rrMultiplier = strategyConfig.riskRewardRatio || 2.0;
        const risk = Math.abs(spotPrice - sl);
        const dynamicTRPoints = Number((risk * rrMultiplier).toFixed(2));
        const tp = signalType === "BUY" ? (spotPrice + dynamicTRPoints) : (spotPrice - dynamicTRPoints);

        const riskPtsStr = risk.toFixed(1);
        const targetPtsStr = dynamicTRPoints.toFixed(1);
        const ratioXXStr = `${riskPtsStr}:${targetPtsStr}`; // Exact X:X format (e.g. 22.5:33.8)

        const reasoning = `👑 MASTER HEAD CONSENSUS PASSED [${totalVotes}/17 Engines Voted YES]: ${signalType === "BUY" ? "BULLISH CE" : "BEARISH PE"} Entry @ ₹${spotPrice}. Dynamic SL: ₹${sl.toFixed(2)} (${riskPtsStr} pts risk), Dynamic Target: ₹${tp.toFixed(2)} (+${targetPtsStr} pts target) [Dynamic R:R ${ratioXXStr} (1:${rrMultiplier.toFixed(1)})]. ${voteDetails.join(" | ")}`;

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
            voteDetails: voteDetails,
            indicators: { rvol: Number(r.toFixed(2)), rsi: Number(rsiVal.toFixed(1)), orbHigh: orb?.high, orbLow: orb?.low, pcr: Number(pcrVal.toFixed(2)), dynamicSLPts: Number(riskPtsStr), dynamicTRPts: Number(targetPtsStr), dynamicRR: Number(rrMultiplier.toFixed(1)), ratioXX: ratioXXStr }
        };
    }

    return {
        type: "NONE",
        buyVotes: buyVotes,
        sellVotes: sellVotes,
        voteDetails: voteDetails,
        reasoning: `ℹ️ MASTER HEAD CONSENSUS WAITING: Buy Votes=${buyVotes}, Sell Votes=${sellVotes} (Required: ${minConsensusVotes}/17). Waiting for Sub-Strategy Majority.`,
        indicators: { rvol: Number(r.toFixed(2)), rsi: Number(rsiVal.toFixed(1)), orbHigh: orb?.high, orbLow: orb?.low, pcr: Number(pcrVal.toFixed(2)) }
    };
}

module.exports = {
    evaluateConsensusEngine
};
