/**
 * 14-Month Multi-Year Historical Backtest Runner (August 2025 -> September 2026)
 * Runs Master Head 5-Engine Consensus Strategy across full 1+ year candle library.
 */

const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

function run14MonthBacktest() {
    console.log("=========================================================================================");
    console.log("📊 14-MONTH HISTORICAL BACKTEST REPORT FOR MASTER HEAD 5-ENGINE CONSENSUS MODEL");
    console.log("   Period: August 2025 ➔ September 2026 (280+ Trading Days)");
    console.log("=========================================================================================\n");

    const candleDir = path.join(__dirname, '../candle_data');
    const monthlyFiles = [
        "NIFTY_50_5_2025-08-02_2025-08-16.json",
        "NIFTY_50_5_2025-08-17_2025-08-31.json",
        "NIFTY_50_5_2025-09-01_2025-09-30.json",
        "NIFTY_50_5_2025-10-01_2025-10-31.json",
        "NIFTY_50_5_2025-11-01_2025-11-30.json",
        "NIFTY_50_5_2025-12-01_2025-12-31.json",
        "NIFTY_50_5_2026-01-01_2026-01-31.json",
        "NIFTY_50_5_2026-02-01_2026-02-28.json",
        "NIFTY_50_5_2026-03-01_2026-03-31.json",
        "NIFTY_50_5_2026-04-01_2026-04-30.json",
        "NIFTY_50_5_2026-05-01_2026-05-31.json",
        "NIFTY_50_5_2026-06-01_2026-06-30.json",
        "NIFTY_50_5_2026-07-01_2026-07-31.json",
        "NIFTY_50_5_2026-08-01_2026-08-31.json",
        "NIFTY_50_5_2026-09-01_2026-09-22.json"
    ];

    let allCandles = [];
    for (const f of monthlyFiles) {
        const fullPath = path.join(candleDir, f);
        if (fs.existsSync(fullPath)) {
            const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            allCandles = allCandles.concat(data);
        }
    }

    allCandles.sort((a, b) => a.timestamp - b.timestamp);
    console.log(`✅ Loaded ${allCandles.length} total 5-minute candles across 14 months!\n`);

    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const strategyConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    const initialCapital = 100000;
    let runningCapital = initialCapital;
    let peakCapital = initialCapital;
    let maxDrawdown = 0;
    let activeTrade = null;

    const completedTrades = [];
    const monthlySummary = {};
    const dailyTradeCounts = {};

    console.log("⚡ Pre-computing indicator series across 14-month dataset...");
    const globalData = prepareJSONStrategyData(allCandles, strategyConfig);

    console.log("⏱️ Running Candle-by-Candle Simulation...\n");

    for (let i = 0; i < allCandles.length; i++) {
        const c = allCandles[i];
        const monthKey = c.date ? c.date.substring(0, 7) : "Unknown";

        if (!monthlySummary[monthKey]) {
            monthlySummary[monthKey] = { trades: 0, wins: 0, losses: 0, pnl: 0, startCap: runningCapital };
        }

        // 1. Position Management
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
                exitReason = "3:00 PM EOD";
                exitPrice = c.close;
                exitPremium = currentPrem;
            }

            if (exitReason) {
                const ptsPnl = Number((exitPremium - activeTrade.optionPremiumPrice).toFixed(2));
                const rupeePnl = Number((ptsPnl * activeTrade.quantity).toFixed(2));
                runningCapital += rupeePnl;

                if (runningCapital > peakCapital) peakCapital = runningCapital;
                const dd = peakCapital > 0 ? ((peakCapital - runningCapital) / peakCapital) * 100 : 0;
                if (dd > maxDrawdown) maxDrawdown = dd;

                monthlySummary[monthKey].trades++;
                if (rupeePnl >= 0) monthlySummary[monthKey].wins++;
                else monthlySummary[monthKey].losses++;
                monthlySummary[monthKey].pnl += rupeePnl;

                completedTrades.push({
                    tradeNo: completedTrades.length + 1,
                    date: c.date,
                    time: `${activeTrade.entryTime} -> ${c.time}`,
                    optionType: activeTrade.optionType,
                    spotEntry: activeTrade.spotEntryPrice,
                    spotExit: exitPrice,
                    rupeePnl,
                    ptsPnl,
                    exitReason,
                    isWin: rupeePnl >= 0,
                    runningBalance: runningCapital
                });
                activeTrade = null;
            }
        }

        // 2. Strategy Evaluation
        const result = evaluateConsensusEngine(allCandles, i, strategyConfig, globalData, dailyTradeCounts);
        if (result.type !== "NONE" && !activeTrade) {
            const optionType = result.type === "BUY" ? "CE" : "PE";
            const spotPrice = c.close;
            const NIFTY_LOT_SIZE = 65;
            const estPremium = Math.max(80, Math.min(250, spotPrice * 0.005));
            // Risk management: lot size capped based on current account equity
            const lotCapCapital = Math.max(25000, runningCapital);
            const numLots = Math.max(1, Math.min(10, Math.floor(lotCapCapital / (estPremium * NIFTY_LOT_SIZE))));
            const qty = numLots * NIFTY_LOT_SIZE;

            const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
                spotPrice,
                signalType: result.type,
                stopLoss: result.stopLoss,
                targetPrice: result.targetPrice,
                riskRewardRatio: strategyConfig.riskRewardRatio || 2.0
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
                quantity: qty
            };

            dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;
        }
    }

    console.log("=========================================================================================");
    console.log("📅 MONTH-BY-MONTH PERFORMANCE BREAKDOWN (AUG 2025 -> SEP 2026)");
    console.log("=========================================================================================");

    const monthTable = Object.keys(monthlySummary).map(m => {
        const s = monthlySummary[m];
        const winRate = s.trades > 0 ? Number(((s.wins / s.trades) * 100).toFixed(1)) : 0;
        const returnPct = s.startCap > 0 ? Number(((s.pnl / s.startCap) * 100).toFixed(1)) : 0;
        return {
            "Month": m,
            "Trades": s.trades,
            "Wins": s.wins,
            "Losses": s.losses,
            "Win Rate": `${winRate}%`,
            "Monthly PnL (₹)": `${s.pnl >= 0 ? '+' : ''}₹${s.pnl.toLocaleString()}`,
            "Monthly Return": `${returnPct >= 0 ? '+' : ''}${returnPct}%`
        };
    });

    console.table(monthTable);

    console.log("\n=========================================================================================");
    console.log("🏆 OVERALL 14-MONTH CUMULATIVE BACKTEST PERFORMANCE");
    console.log("=========================================================================================");
    const totalTrades = completedTrades.length;
    const totalWins = completedTrades.filter(t => t.isWin).length;
    const totalLosses = totalTrades - totalWins;
    const winRate = totalTrades > 0 ? Number(((totalWins / totalTrades) * 100).toFixed(1)) : 0;
    const netPnL = Number((runningCapital - initialCapital).toFixed(2));
    const totalReturn = Number(((netPnL / initialCapital) * 100).toFixed(2));

    const totalProfitRupees = completedTrades.filter(t => t.isWin).reduce((sum, t) => sum + t.rupeePnl, 0);
    const totalLossRupees = Math.abs(completedTrades.filter(t => !t.isWin).reduce((sum, t) => sum + t.rupeePnl, 0));
    const profitFactor = totalLossRupees > 0 ? Number((totalProfitRupees / totalLossRupees).toFixed(2)) : "N/A";

    console.log(`💼 Starting Capital     : ₹${initialCapital.toLocaleString()}`);
    console.log(`💰 Final Ending Capital : ₹${runningCapital.toLocaleString()}`);
    console.log(`💵 Net Realized PnL    : ${netPnL >= 0 ? '+' : ''}₹${netPnL.toLocaleString()} (${totalReturn}%)`);
    console.log(`📊 Total Trades        : ${totalTrades}`);
    console.log(`🟢 Winning Trades      : ${totalWins}`);
    console.log(`🔴 Losing Trades       : ${totalLosses}`);
    console.log(`🎯 Overall Win Rate    : ${winRate}%`);
    console.log(`📈 Profit Factor       : ${profitFactor}`);
    console.log(`📉 Maximum Drawdown    : ${maxDrawdown.toFixed(2)}%`);
    console.log("-----------------------------------------------------------------------------------------\n");
}

run14MonthBacktest();
