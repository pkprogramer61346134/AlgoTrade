/**
 * Multi-Strategy Consensus Engine (Master Head Voting System - 15-Engine High-Conviction System)
 * Aggregates 15 Sub-Strategy Engines
 * Requires High-Conviction Majority Consensus (>= 11 out of 15 YES Votes) to execute trade.
 */

function evaluateConsensusEngine(candles, i, strategyConfig, data, dailyTradeCounts) {
    if (i < 3) return { type: "NONE" };
    const c = candles[i];
    if (!c.date) return { type: "NONE" };

    const maxTrades = strategyConfig.maxTradesPerDay || 4;
    if ((dailyTradeCounts[c.date] || 0) >= maxTrades) return { type: "NONE" };

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

    // Sub-Engine 2: Relative Volume Surge (RVOL >= 1.2x)
    if (r >= 1.2) {
        buyVotes++;
        sellVotes++;
        voteDetails.push(`Engine 2 [Volume Surge ${r.toFixed(2)}x >= 1.2x]: CONFIRMED (+1 Both)`);
    }

    // Sub-Engine 3: RSI Momentum Direction (RSI > 52 / RSI < 48)
    if (rsiVal > 52) {
        buyVotes++;
        voteDetails.push(`Engine 3 [RSI ${rsiVal.toFixed(1)} > 52]: BULLISH (+1)`);
    } else if (rsiVal < 48) {
        sellVotes++;
        voteDetails.push(`Engine 3 [RSI ${rsiVal.toFixed(1)} < 48]: BEARISH (+1)`);
    }

    // Sub-Engine 4: EMA Trend Alignment
    if (emaVal !== null && c.close > emaVal) {
        buyVotes++;
        voteDetails.push(`Engine 4 [Price ₹${c.close} > EMA ₹${emaVal.toFixed(1)}]: BULLISH TREND (+1)`);
    } else if (emaVal !== null && c.close < emaVal) {
        sellVotes++;
        voteDetails.push(`Engine 4 [Price ₹${c.close} < EMA ₹${emaVal.toFixed(1)}]: BEARISH TREND (+1)`);
    }

    // Sub-Engine 5: PCR Option Chain Sentiment
    if (pcrVal >= 1.0) {
        buyVotes++;
        voteDetails.push(`Engine 5 [PCR ${pcrVal.toFixed(2)} >= 1.0]: BULLISH SENTIMENT (+1)`);
    } else if (pcrVal <= 0.9) {
        sellVotes++;
        voteDetails.push(`Engine 5 [PCR ${pcrVal.toFixed(2)} <= 0.9]: BEARISH SENTIMENT (+1)`);
    }

    // Sub-Engine 6: Volatility Expansion (ATR >= 12)
    if (atrVal >= 12) {
        buyVotes++;
        sellVotes++;
        voteDetails.push(`Engine 6 [ATR Volatility ${atrVal.toFixed(1)} >= 12]: CONFIRMED (+1 Both)`);
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
    if (stObj && stObj.direction) {
        if (stObj.direction === "UP") {
            buyVotes++;
            voteDetails.push(`Engine 9 [Supertrend ${stObj.value?.toFixed ? stObj.value.toFixed(1) : ''}]: BULLISH (+1)`);
        } else if (stObj.direction === "DOWN") {
            sellVotes++;
            voteDetails.push(`Engine 9 [Supertrend ${stObj.value?.toFixed ? stObj.value.toFixed(1) : ''}]: BEARISH (+1)`);
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

    // Sub-Engine 13: Previous Day High / Low Institutional Level Break Engine
    const prevDay = (data.prevDayMap && data.prevDayMap[c.date]) ? data.prevDayMap[c.date] : null;
    if (prevDay) {
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

    const minConsensusVotes = strategyConfig.consensusThreshold || 11; // Default 11 out of 15 High Conviction Vote
    let signalType = "NONE";

    if (buyVotes >= minConsensusVotes && buyVotes > sellVotes) {
        signalType = "BUY";
    } else if (sellVotes >= minConsensusVotes && sellVotes > buyVotes) {
        signalType = "SELL";
    }

    if (signalType !== "NONE") {
        const spotPrice = c.close;
        const spotRisk = Math.abs(spotPrice - (signalType === "BUY" ? orb.low : orb.high));
        const validRisk = Math.max(10, Math.min(40, spotRisk));

        let sl = signalType === "BUY" ? (spotPrice - validRisk) : (spotPrice + validRisk);
        if (strategyConfig.stopLoss?.type === "ORB_LEVEL" && orb) {
            sl = signalType === "BUY" ? orb.low : orb.high;
        }

        const rrMultiplier = strategyConfig.target?.multiplier || strategyConfig.riskRewardRatio || 3.0;
        const risk = Math.abs(spotPrice - sl);
        const tp = signalType === "BUY" ? (spotPrice + (rrMultiplier * risk)) : (spotPrice - (rrMultiplier * risk));

        dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;

        const totalVotes = signalType === "BUY" ? buyVotes : sellVotes;
        const reasoning = `👑 MASTER HEAD CONSENSUS PASSED [${totalVotes}/15 Engines Voted YES]: ${signalType === "BUY" ? "BULLISH CE" : "BEARISH PE"} Entry @ ₹${spotPrice}. SL: ₹${sl.toFixed(2)}, Target (1:${rrMultiplier}): ₹${tp.toFixed(2)}. ${voteDetails.join(" | ")}`;

        return {
            type: signalType,
            entryPrice: spotPrice,
            stopLoss: Number(sl.toFixed(2)),
            targetPrice: Number(tp.toFixed(2)),
            reasoning: reasoning,
            consensusVotes: totalVotes,
            voteDetails: voteDetails,
            indicators: { rvol: Number(r.toFixed(2)), rsi: Number(rsiVal.toFixed(1)), orbHigh: orb?.high, orbLow: orb?.low, pcr: Number(pcrVal.toFixed(2)) }
        };
    }

    return {
        type: "NONE",
        reasoning: `ℹ️ MASTER HEAD CONSENSUS WAITING: Buy Votes=${buyVotes}, Sell Votes=${sellVotes} (Required: ${minConsensusVotes}/15). Waiting for Sub-Strategy Majority.`,
        indicators: { rvol: Number(r.toFixed(2)), rsi: Number(rsiVal.toFixed(1)), orbHigh: orb?.high, orbLow: orb?.low, pcr: Number(pcrVal.toFixed(2)) }
    };
}

module.exports = {
    evaluateConsensusEngine
};
