/**
 * Multi-Dataset AI Hyperparameter Optimizer & Backtest Trainer
 */

const path = require('path');
const fs = require('fs');
const ConsensusEngineOptimizer = require('../src/consensusOptimizer');

function runMultiDatasetOptimizer() {
    console.log("=========================================================================================");
    console.log("🤖 MULTI-DATASET 5-ENGINE AI HYPERPARAMETER OPTIMIZER");
    console.log("=========================================================================================\n");

    const datasets = [
        { name: "Today (2026-09-22)", file: "NIFTY_50_5_2026-09-22_2026-09-22.json" },
        { name: "September 2026 Month (2026-09-01 -> 2026-09-22)", file: "NIFTY_50_5_2026-09-01_2026-09-22.json" }
    ];

    for (const d of datasets) {
        const fullPath = path.join(__dirname, '../candle_data', d.file);
        if (!fs.existsSync(fullPath)) continue;

        console.log(`=========================================================================================`);
        console.log(`📊 EVALUATING DATASET: ${d.name}`);
        console.log(`=========================================================================================`);

        const optimizer = new ConsensusEngineOptimizer({
            initialCapital: 100000,
            datasetPath: fullPath
        });

        const report = optimizer.optimize();

        const leaderboard = report.topCandidates.slice(0, 5).map((c, idx) => ({
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
        console.log("");
    }
}

runMultiDatasetOptimizer();
