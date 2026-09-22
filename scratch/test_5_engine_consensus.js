const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

function test5EngineBacktest() {
    const todayFilePath = path.join(__dirname, '..', 'candle_data', 'NIFTY_50_5_2026-09-22_2026-09-22.json');
    const candles = JSON.parse(fs.readFileSync(todayFilePath, 'utf8'));

    const strategyConfig = {
        consensusThreshold: 3,
        indicators: { rvolMin: 1.15, rsiBullMin: 54, rsiBearMax: 46 }
    };

    console.log("=========================================================================================");
    console.log("📊 FULL BACKTEST RESULT FOR TODAY USING TOP 5 ENGINE MODEL");
    console.log("=========================================================================================\n");

    let runningCapital = 100000;
    let activeTrade = null;
    const completedTrades = [];
    let tradeCount = 0;

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const evalCandles = candles.slice(0, i + 1);
        const data = prepareJSONStrategyData(evalCandles, strategyConfig);
        const evalIdx = evalCandles.length - 1;

        // 1. Position Exit Check
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
                    isWin: rupeePnl >= 0
                });

                console.log(`🔴 [EXIT AT ${c.time}] ${exitReason} | Exit Prem: ₹${exitPremium.toFixed(2)} | PnL: ${rupeePnl >= 0 ? '+' : ''}₹${rupeePnl.toLocaleString()} (${ptsPnl >= 0 ? '+' : ''}${ptsPnl} pts)`);
                activeTrade = null;
            }
        }

        // 2. Position Entry Check
        if (!activeTrade && tradeCount < 3 && c.time >= "09:15" && c.time <= "15:00") {
            const r = (data.rvol && data.rvol[evalIdx] !== null) ? Number(data.rvol[evalIdx]) : 1.0;
            const rsiVal = (data.rsi && data.rsi[evalIdx] !== null) ? Number(data.rsi[evalIdx]) : 50;
            const emaVal = (data.emaTrend && data.emaTrend[evalIdx] !== null) ? Number(data.emaTrend[evalIdx]) : null;
            const vwapVal = (data.vwap && data.vwap[evalIdx]) ? Number(data.vwap[evalIdx]) : null;
            const stObj = (data.supertrend && data.supertrend[evalIdx]) ? data.supertrend[evalIdx] : null;
            const prevC = i > 0 ? candles[i - 1] : null;

            let buyVotes = 0;
            let sellVotes = 0;
            const voteDetails = [];

            if (r >= 1.15) { buyVotes++; sellVotes++; voteDetails.push(`RVOL ${r.toFixed(2)}x`); }
            if (rsiVal > 54) { buyVotes++; voteDetails.push(`RSI ${rsiVal.toFixed(1)} > 54`); }
            else if (rsiVal < 46) { sellVotes++; voteDetails.push(`RSI ${rsiVal.toFixed(1)} < 46`); }

            if (emaVal !== null && c.close > emaVal) { buyVotes++; voteDetails.push(`Price > EMA 50`); }
            else if (emaVal !== null && c.close < emaVal) { sellVotes++; voteDetails.push(`Price < EMA 50`); }

            if (vwapVal !== null && c.close > vwapVal) { buyVotes++; voteDetails.push(`Price > VWAP`); }
            else if (vwapVal !== null && c.close < vwapVal) { sellVotes++; voteDetails.push(`Price < VWAP`); }

            const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
            const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");
            const isBullEngulf = prevC && c.close > c.open && c.close > prevC.high;
            const isBearEngulf = prevC && c.close < c.open && c.close < prevC.low;

            if (isStBull || isBullEngulf) { buyVotes++; voteDetails.push(`Supertrend/PA Bullish`); }
            else if (isStBear || isBearEngulf) { sellVotes++; voteDetails.push(`Supertrend/PA Bearish`); }

            let signalType = "NONE";
            if (buyVotes >= 3 && buyVotes > sellVotes) signalType = "BUY";
            else if (sellVotes >= 3 && sellVotes > buyVotes) signalType = "SELL";

            if (signalType !== "NONE") {
                const optionType = signalType === "BUY" ? "CE" : "PE";
                const spotPrice = c.close;
                const NIFTY_LOT_SIZE = 65;
                const estPremium = Math.max(80, Math.min(250, spotPrice * 0.005));
                const numLots = Math.max(1, Math.floor(runningCapital / (estPremium * NIFTY_LOT_SIZE)));
                const qty = numLots * NIFTY_LOT_SIZE;
                const atrVal = (data.atr && data.atr[evalIdx] !== null) ? Number(data.atr[evalIdx]) : 15;

                const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
                    spotPrice,
                    signalType,
                    stopLoss: signalType === "BUY" ? spotPrice - (atrVal * 1.5) : spotPrice + (atrVal * 1.5),
                    targetPrice: signalType === "BUY" ? spotPrice + (atrVal * 3.0) : spotPrice - (atrVal * 3.0),
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

                tradeCount++;
                console.log(`🟢 [ENTRY AT ${c.time}] ${optionType} ENTRY @ Spot ₹${spotPrice} | Premium ₹${estPremium.toFixed(2)} | Votes: ${signalType === "BUY" ? buyVotes : sellVotes}/5 | SL: ₹${spotStruct.spotSL} | Target: ₹${spotStruct.spotTarget}`);
            }
        }
    }

    console.log("\n=========================================================================================");
    console.log("📈 TODAY'S 5-ENGINE BACKTEST SUMMARY");
    console.log("=========================================================================================");
    const netPnL = Number((runningCapital - 100000).toFixed(2));
    const winCount = completedTrades.filter(t => t.isWin).length;
    console.log(`💰 Net PnL: ${netPnL >= 0 ? '+' : ''}₹${netPnL.toLocaleString()} | Total Trades: ${completedTrades.length} | Wins: ${winCount} | Win Rate: ${completedTrades.length > 0 ? ((winCount/completedTrades.length)*100).toFixed(1) : 0}%`);
    if (completedTrades.length > 0) {
        console.table(completedTrades.map(t => ({
            "#": t.tradeNo,
            "Time": `${t.entryTime} -> ${t.exitTime}`,
            "Contract": `NIFTY ${t.optionType} (${t.numLots} Lot)`,
            "Spot Entry": `₹${t.spotEntryPrice}`,
            "Spot Exit": `₹${t.spotExitPrice}`,
            "PnL (₹)": `${t.rupeePnl >= 0 ? '+' : ''}₹${t.rupeePnl.toLocaleString()}`,
            "Exit Reason": t.exitReason
        })));
    }
}

test5EngineBacktest();
