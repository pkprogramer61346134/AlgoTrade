/**
 * Today (2026-09-22) Backtest Runner for Master Head Consensus Engine
 */

const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

function runTodayBacktest() {
    console.log("=========================================================================================");
    console.log("📊 REAL-TIME BACKTEST REPORT FOR TODAY: SEPTEMBER 22, 2026");
    console.log("   Strategy: Master Head Consensus Engine (Top 10 Institutional Engines)");
    console.log("=========================================================================================\n");

    const todayFilePath = path.join(__dirname, '..', 'candle_data', 'NIFTY_50_5_2026-09-22_2026-09-22.json');
    if (!fs.existsSync(todayFilePath)) {
        console.error(`❌ File not found: ${todayFilePath}`);
        return;
    }

    const candles = JSON.parse(fs.readFileSync(todayFilePath, 'utf8'));
    console.log(`✅ Loaded ${candles.length} candles for Today (2026-09-22)\n`);

    const stratPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    let strategyConfig = { id: "consensus_master_head", name: "Master Head Consensus Engine", consensusThreshold: 6 };
    if (fs.existsSync(stratPath)) {
        strategyConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));
    }

    const initialCapital = 100000;
    let runningCapital = initialCapital;
    let activeTrade = null;
    const completedTrades = [];
    const dailyTradeCounts = {};

    console.log("-----------------------------------------------------------------------------------------");
    console.log("⏱️ CANDLE-BY-CANDLE EVALUATION LOG");
    console.log("-----------------------------------------------------------------------------------------\n");

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const data = prepareJSONStrategyData(candles.slice(0, i + 1), strategyConfig);
        const evalIdx = i;

        // 1. Monitor open position if active
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
                    optionSymbol: activeTrade.optionSymbol,
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

                console.log(`🔴 [EXIT AT ${c.time}] ${exitReason} | Exit Premium: ₹${exitPremium.toFixed(2)} | Spot: ₹${c.close} | PnL: ${rupeePnl >= 0 ? '+' : ''}₹${rupeePnl.toLocaleString()} (${ptsPnl >= 0 ? '+' : ''}${ptsPnl} pts)`);
                activeTrade = null;
            }
        }

        // 2. Evaluate Consensus Engine for new entries if no active position
        const result = evaluateConsensusEngine(candles.slice(0, i + 1), evalIdx, strategyConfig, data, dailyTradeCounts);

        if (result.type !== "NONE" && !activeTrade) {
            const optionType = result.type === "BUY" ? "CE" : "PE";
            const spotPrice = c.close;
            const NIFTY_LOT_SIZE = 65;
            const estPremium = Math.max(80, Math.min(250, spotPrice * 0.005));
            const numLots = Math.max(1, Math.floor(runningCapital / (estPremium * NIFTY_LOT_SIZE)));
            const qty = numLots * NIFTY_LOT_SIZE;
            const atmStrike = Math.round(spotPrice / 50) * 50;

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
                atmStrike,
                optionSymbol: `NIFTY-2026-09-22-${atmStrike}-${optionType}`,
                numLots,
                quantity: qty,
                votes: result.consensusVotes || result.buyVotes || result.sellVotes
            };

            dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;

            console.log(`🟢 [ENTRY AT ${c.time}] ${optionType} ENTRY @ Spot ₹${spotPrice} | Premium ₹${estPremium.toFixed(2)} | Votes: ${activeTrade.votes}/10 YES | SL: ₹${spotStruct.spotSL} | Target: ₹${spotStruct.spotTarget} | Qty: ${numLots} Lot (${qty})`);
        }
    }

    console.log("\n=========================================================================================");
    console.log("📈 TODAY'S BACKTEST PERFORMANCE SUMMARY (SEPTEMBER 22, 2026)");
    console.log("=========================================================================================");

    const totalTrades = completedTrades.length;
    const winningTrades = completedTrades.filter(t => t.isWin).length;
    const losingTrades = completedTrades.filter(t => !t.isWin).length;
    const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;
    const netPnL = Number((runningCapital - initialCapital).toFixed(2));

    console.log(`💼 Starting Capital : ₹${initialCapital.toLocaleString()}`);
    console.log(`💰 Ending Capital   : ₹${runningCapital.toLocaleString()}`);
    console.log(`💵 Net Realized PnL: ${netPnL >= 0 ? '+' : ''}₹${netPnL.toLocaleString()} (${((netPnL / initialCapital) * 100).toFixed(2)}%)`);
    console.log(`📊 Total Trades Executed : ${totalTrades}`);
    console.log(`🟢 Winning Trades  : ${winningTrades}`);
    console.log(`🔴 Losing Trades   : ${losingTrades}`);
    console.log(`🎯 Win Rate        : ${winRate}%`);
    console.log("-----------------------------------------------------------------------------------------");

    if (totalTrades > 0) {
        console.log("\n📋 DETAILED TRADE LOG FOR TODAY:");
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
    } else {
        console.log("ℹ️ No trades triggered today. Consensus threshold (>= 6/10) was strictly respected for capital protection.");
    }
}

runTodayBacktest();
