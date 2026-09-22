/**
 * Runner Script for 5-Engine AI Parameter Optimizer & Backtest Trainer
 */

const path = require('path');
const fs = require('fs');
const ConsensusEngineOptimizer = require('../src/consensusOptimizer');

function runOptimizationProcess() {
    console.log("=========================================================================================");
    console.log("🤖 AUTOMATED 5-ENGINE AI HYPERPARAMETER OPTIMIZER & BACKTEST TRAINER");
    console.log("=========================================================================================\n");

    const datasetPath = path.join(__dirname, '../candle_data/NIFTY_50_5_2026-09-01_2026-09-22.json');
    if (!fs.existsSync(datasetPath)) {
        console.error(`❌ Dataset file not found: ${datasetPath}`);
        return;
    }

    const optimizer = new ConsensusEngineOptimizer({
        initialCapital: 100000,
        datasetPath: datasetPath
    });

    const report = optimizer.optimize();

    console.log("\n=========================================================================================");
    console.log("🏆 TOP 10 OPTIMAL PARAMETER SETS LEADERBOARD (SEPTEMBER 2026 DATASET)");
    console.log("=========================================================================================");

    const leaderboard = report.topCandidates.map((c, idx) => ({
        "Rank": `#${idx + 1}`,
        "Fitness": c.fitnessScore,
        "Net PnL (₹)": `${c.netPnL >= 0 ? '+' : ''}₹${c.netPnL.toLocaleString()}`,
        "Return (%)": `${c.returnPct}%`,
        "Win Rate": `${c.winRate}%`,
        "Trades (W/L)": `${c.wins}/${c.losses} (${c.totalTrades})`,
        "Max DD": `${c.maxDrawdown}%`,
        "Params (RVOL | RSI B/S | StartTime | R:R)": `RVOL ${c.params.rvolMin}x | RSI ${c.params.rsiBullMin}/${c.params.rsiBearMax} | ${c.params.entryStartMins === 610 ? '10:10 AM' : (c.params.entryStartMins === 605 ? '10:05 AM' : '09:55 AM')} | 1:${c.params.riskRewardRatio}`
    }));

    console.table(leaderboard);

    const best = report.bestConfig;
    console.log("\n=========================================================================================");
    console.log("🌟 BEST RECOMMENDED HYPERPARAMETER CONFIGURATION");
    console.log("=========================================================================================");
    console.log(`🔹 Fitness Score     : ${best.fitnessScore}`);
    console.log(`💰 Net Realized PnL  : ${best.netPnL >= 0 ? '+' : ''}₹${best.netPnL.toLocaleString()} (${best.returnPct}%)`);
    console.log(`🟢 Win Rate          : ${best.winRate}% (${best.wins} Wins / ${best.losses} Losses)`);
    console.log(`📉 Max Drawdown      : ${best.maxDrawdown}%`);
    console.log(`⏱️ Optimal Start Time : ${best.params.entryStartMins === 610 ? '10:10 AM' : (best.params.entryStartMins === 605 ? '10:05 AM' : '09:55 AM')}`);
    console.log(`📊 Minimum RVOL      : ${best.params.rvolMin}x`);
    console.log(`📈 RSI Thresholds    : Bullish > ${best.params.rsiBullMin} | Bearish < ${best.params.rsiBearMax}`);
    console.log(`🎯 Risk Reward Ratio  : 1:${best.params.riskRewardRatio}`);
    console.log("-----------------------------------------------------------------------------------------\n");
}

runOptimizationProcess();
