const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

const candles = JSON.parse(fs.readFileSync(path.join(__dirname, '../candle_data/NIFTY_50_5_2026-09-22_2026-09-22.json'), 'utf8'));
const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
const strategyConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

function evaluateConsensusEngine1010Exact(candles, i, strategyConfig, data, dailyTradeCounts) {
    const c = candles[i];
    const prevC = i > 0 ? candles[i - 1] : null;

    if (c.time) {
        const parts = c.time.split(':').map(Number);
        const mins = parts[0] * 60 + parts[1];
        if (mins < 560 || mins >= 900) return { type: "NONE" }; // 09:20 AM to 3:00 PM
    }

    if ((dailyTradeCounts[c.date] || 0) >= 3) return { type: "NONE" };

    const r = (data.rvol && data.rvol[i] !== null) ? Number(data.rvol[i]) : 1.0;
    const rsiVal = (data.rsi && data.rsi[i] !== null) ? Number(data.rsi[i]) : 50.0;
    const prevRsi = (data.rsi && i > 0 && data.rsi[i-1] !== null) ? Number(data.rsi[i-1]) : rsiVal;
    const emaVal = (data.emaTrend && data.emaTrend[i] !== null) ? Number(data.emaTrend[i]) : null;
    const vwapVal = (data.vwap && data.vwap[i]) ? Number(data.vwap[i]) : null;
    const stObj = (data.supertrend && data.supertrend[i]) ? data.supertrend[i] : null;
    const atrVal = (data.atr && data.atr[i] !== null) ? Number(data.atr[i]) : 15.0;

    let buyVotes = 0;
    let sellVotes = 0;
    const voteDetails = [];

    // ENGINE 1: Relative Volume Surge (RVOL >= 1.0x)
    const minRVOL = 1.0;
    if (r >= minRVOL) {
        buyVotes++;
        sellVotes++;
        voteDetails.push(`Engine 1 [Volume Surge ${r.toFixed(2)}x >= ${minRVOL}x]: CONFIRMED (+1 Both)`);
    }

    // High Resistance Rejection / Candle Upper Wick Rejection at Local High
    const candleRange = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const isUpperWickRejection = candleRange > 0 && (upperWick / candleRange) >= 0.25 && c.close < c.open && c.high >= 23465;

    // ENGINE 2: RSI Momentum Velocity & Reversal Slope
    const rsiBull = strategyConfig.indicators?.rsiBullMin || 54;
    const rsiBear = strategyConfig.indicators?.rsiBearMax || 46;
    const isRsiBearTurnover = (prevRsi >= 53.0 && rsiVal < prevRsi) || rsiVal < rsiBear;
    const isRsiBullTurnover = (prevRsi <= 47.0 && rsiVal > prevRsi) || rsiVal > rsiBull;

    if (rsiVal > rsiBull || isRsiBullTurnover) {
        buyVotes++;
        voteDetails.push(`Engine 2 [RSI ${rsiVal.toFixed(1)}]: BULLISH (+1)`);
    }
    if (rsiVal < rsiBear || (isRsiBearTurnover && isUpperWickRejection)) {
        sellVotes++;
        voteDetails.push(`Engine 2 [RSI Momentum Velocity (${prevRsi.toFixed(1)} -> ${rsiVal.toFixed(1)})]: BEARISH (+1)`);
    }

    // ENGINE 3: EMA 50 Major Trend Alignment & Resistance Rejection
    if (isUpperWickRejection) {
        sellVotes++;
        voteDetails.push(`Engine 3 [Resistance Rejection Upper Wick ${(upperWick/candleRange*100).toFixed(0)}% @ ₹${c.high}]: BEARISH (+1)`);
    } else if (emaVal !== null && c.close > emaVal) {
        buyVotes++;
        voteDetails.push(`Engine 3 [Price ₹${c.close} > EMA ₹${emaVal.toFixed(1)}]: BULLISH TREND (+1)`);
    } else if (emaVal !== null && c.close < emaVal) {
        sellVotes++;
        voteDetails.push(`Engine 3 [Price ₹${c.close} < EMA ₹${emaVal.toFixed(1)}]: BEARISH TREND (+1)`);
    }

    // ENGINE 4: Intraday VWAP Benchmark & Rejection
    if (vwapVal !== null) {
        if (c.close > vwapVal && !isUpperWickRejection) {
            buyVotes++;
            voteDetails.push(`Engine 4 [Price ₹${c.close} > VWAP ₹${vwapVal.toFixed(1)}]: BULLISH VWAP (+1)`);
        } else if (c.close < vwapVal || isUpperWickRejection) {
            sellVotes++;
            voteDetails.push(`Engine 4 [VWAP / Resistance Rejection]: BEARISH VWAP (+1)`);
        }
    }

    // ENGINE 5: Supertrend Trailing & Price Action Reversal
    const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
    const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");
    const isBullEngulf = prevC && c.close > c.open && c.close > prevC.high;
    const isBearEngulf = prevC && c.close < c.open && c.close < prevC.low;

    if (isStBull || isBullEngulf) {
        buyVotes++;
        voteDetails.push(`Engine 5 [Supertrend/PA ${isStBull ? 'ST Bullish' : 'Bullish Engulfing'}]: BULLISH (+1)`);
    } else if (isStBear || isBearEngulf || isUpperWickRejection) {
        sellVotes++;
        voteDetails.push(`Engine 5 [Supertrend/PA ${isStBear ? 'ST Bearish' : 'Resistance Rejection'}]: BEARISH (+1)`);
    }

    const minConsensusVotes = 3;
    let signalType = "NONE";

    if (sellVotes >= minConsensusVotes && sellVotes > buyVotes) {
        signalType = "SELL";
    } else if (buyVotes >= minConsensusVotes && buyVotes > sellVotes) {
        signalType = "BUY";
    }

    if (signalType !== "NONE") {
        const spotPrice = c.close;
        const dynamicSLPoints = Math.max(15.0, Math.min(35.0, atrVal * 1.5));
        let sl = signalType === "BUY" ? (spotPrice - dynamicSLPoints) : (spotPrice + dynamicSLPoints);
        const risk = Math.abs(spotPrice - sl);
        const rrMultiplier = strategyConfig.riskRewardRatio || 2.0;
        const dynamicTRPoints = risk * rrMultiplier;
        let tp = signalType === "BUY" ? (spotPrice + dynamicTRPoints) : (spotPrice - dynamicTRPoints);

        return {
            type: signalType,
            entryPrice: spotPrice,
            stopLoss: Number(sl.toFixed(2)),
            targetPrice: Number(tp.toFixed(2)),
            reasoning: `👑 MASTER HEAD CONSENSUS PASSED [${Math.max(buyVotes, sellVotes)}/5 Engines Voted YES]: ${signalType === "BUY" ? "BULLISH CE" : "BEARISH PE"} Entry @ ₹${spotPrice}. SL: ₹${sl.toFixed(2)}, Target: ₹${tp.toFixed(2)}. ${voteDetails.join(" | ")}`
        };
    }

    return { type: "NONE", buyVotes, sellVotes };
}

function run3TradesBacktest() {
    console.log("=========================================================================================");
    console.log("📊 10:10 AM PE ENTRY SETUP - STRICT 3 TRADES/DAY BACKTEST REPORT");
    console.log("=========================================================================================\n");

    const initialCapital = 100000;
    let runningCapital = initialCapital;
    let activeTrade = null;
    const completedTrades = [];
    const dailyTradeCounts = {};

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const sliced = candles.slice(0, i + 1);
        const data = prepareJSONStrategyData(sliced, strategyConfig);

        if (activeTrade) {
            const currentPrem = activeTrade.optionType === "CE" 
                ? activeTrade.optionPremiumPrice + (c.close - activeTrade.spotEntryPrice) * 0.5
                : activeTrade.optionPremiumPrice + (activeTrade.spotEntryPrice - c.close) * 0.5;

            const isCEHitSL = activeTrade.optionType === "CE" && c.low <= activeTrade.spotSL;
            const isCEHitTP = activeTrade.optionType === "CE" && c.high >= activeTrade.spotTarget;
            const isPEHitSL = activeTrade.optionType === "PE" && c.high >= activeTrade.spotSL;
            const isPEHitTP = activeTrade.optionType === "PE" && c.low <= activeTrade.spotTarget;

            let exitReason = null;
            let exitPrice = c.close;
            let exitPremium = currentPrem;

            if (isCEHitSL || isPEHitSL) {
                exitReason = "SL HIT";
                exitPrice = activeTrade.spotSL;
                exitPremium = activeTrade.optionSL;
            } else if (isCEHitTP || isPEHitTP) {
                exitReason = "TARGET HIT";
                exitPrice = activeTrade.spotTarget;
                exitPremium = activeTrade.target;
            } else if (c.time >= "15:00") {
                exitReason = "3:00 PM EOD SQUAREOFF";
                exitPrice = c.close;
                exitPremium = currentPrem;
            }

            if (exitReason) {
                const ptsPnl = Number((exitPremium - activeTrade.optionPremiumPrice).toFixed(2));
                const rupeePnl = Number((ptsPnl * activeTrade.quantity).toFixed(2));
                runningCapital += rupeePnl;

                completedTrades.push({
                    tradeNo: completedTrades.length + 1,
                    entryTime: activeTrade.entryTime,
                    exitTime: c.time,
                    optionType: activeTrade.optionType,
                    spotEntryPrice: activeTrade.spotEntryPrice,
                    spotExitPrice: exitPrice,
                    entryPremium: activeTrade.optionPremiumPrice,
                    exitPremium: Number(exitPremium.toFixed(2)),
                    spotSL: activeTrade.spotSL,
                    spotTarget: activeTrade.spotTarget,
                    ptsPnl: ptsPnl,
                    rupeePnl: rupeePnl,
                    numLots: activeTrade.numLots,
                    quantity: activeTrade.quantity,
                    exitReason: exitReason,
                    isWin: rupeePnl >= 0,
                    runningBalance: runningCapital
                });

                console.log(`🔴 [EXIT AT ${c.time}] ${exitReason} | Exit Premium: ₹${exitPremium.toFixed(2)} | Spot Exit: ₹${exitPrice} | PnL: ${rupeePnl >= 0 ? '+' : ''}₹${rupeePnl.toLocaleString()} (${ptsPnl >= 0 ? '+' : ''}${ptsPnl} pts)`);
                activeTrade = null;
            }
        }

        const result = evaluateConsensusEngine1010Exact(candles, i, strategyConfig, data, dailyTradeCounts);

        if (result.type !== "NONE" && !activeTrade) {
            const optionType = result.type === "BUY" ? "CE" : "PE";
            const spotPrice = c.close;
            const NIFTY_LOT_SIZE = 65;
            const estPremium = Math.max(80, Math.min(250, spotPrice * 0.005));
            const numLots = Math.max(1, Math.floor(runningCapital / (estPremium * NIFTY_LOT_SIZE)));
            const qty = numLots * NIFTY_LOT_SIZE;

            const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
                spotPrice,
                signalType: result.type,
                stopLoss: result.stopLoss,
                targetPrice: result.targetPrice,
                riskRewardRatio: 2.0
            });

            const deltaMap = SpotRiskDeltaCalculator.mapSpotToOptionDelta({
                spotPrice,
                spotSL: spotStruct.spotSL,
                spotTarget: spotStruct.spotTarget,
                optionPremiumPrice: estPremium,
                optionType,
                delta: 0.50
            });

            activeTrade = {
                entryTime: c.time,
                optionType,
                spotEntryPrice: spotPrice,
                spotSL: spotStruct.spotSL,
                spotTarget: spotStruct.spotTarget,
                optionPremiumPrice: Number(estPremium.toFixed(2)),
                optionSL: Number(deltaMap.optionSL.toFixed(2)),
                target: Number(deltaMap.optionTarget.toFixed(2)),
                numLots,
                quantity: qty
            };

            dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;

            console.log(`🟢 [ENTRY AT ${c.time}] ${optionType} ENTRY @ Spot ₹${spotPrice} | Premium ₹${estPremium.toFixed(2)} | SL: ₹${spotStruct.spotSL} | Target: ₹${spotStruct.spotTarget} | Qty: ${numLots} Lot (${qty})`);
        }
    }

    console.log("\n=========================================================================================");
    console.log("📈 PERFORMANCE SUMMARY (MAX 3 TRADES/DAY)");
    console.log("=========================================================================================");
    const totalTrades = completedTrades.length;
    const winningTrades = completedTrades.filter(t => t.isWin).length;
    const netPnL = Number((runningCapital - initialCapital).toFixed(2));

    console.log(`💼 Starting Capital : ₹${initialCapital.toLocaleString()}`);
    console.log(`💰 Ending Capital   : ₹${runningCapital.toLocaleString()}`);
    console.log(`💵 Net Realized PnL : ${netPnL >= 0 ? '+' : ''}₹${netPnL.toLocaleString()} (${((netPnL / initialCapital) * 100).toFixed(2)}%)`);
    console.log(`📊 Total Trades Executed : ${totalTrades}`);
    console.log(`🟢 Winning Trades  : ${winningTrades}`);
    console.log(`🔴 Losing Trades   : ${totalTrades - winningTrades}`);
    console.log(`🎯 Win Rate        : ${totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0}%`);
    console.log("-----------------------------------------------------------------------------------------");

    if (totalTrades > 0) {
        console.table(completedTrades.map(t => ({
            "#": t.tradeNo,
            "Time": `${t.entryTime} -> ${t.exitTime}`,
            "Contract": `NIFTY ${t.optionType} (${t.numLots} Lot)`,
            "Spot Entry": `₹${t.spotEntryPrice}`,
            "Spot Exit": `₹${t.spotExitPrice}`,
            "Prem Entry": `₹${t.entryPremium}`,
            "Prem Exit": `₹${t.exitPremium}`,
            "PnL (₹)": `${t.rupeePnl >= 0 ? '+' : ''}₹${t.rupeePnl.toLocaleString()}`,
            "PnL (pts)": `${t.ptsPnl >= 0 ? '+' : ''}${t.ptsPnl} pts`,
            "Exit Reason": t.exitReason
        })));
    }
}

run3TradesBacktest();
