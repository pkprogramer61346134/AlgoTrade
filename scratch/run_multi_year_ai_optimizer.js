/**
 * Multi-Year / Multi-Month AI Hyperparameter Optimizer & Backtest Trainer
 * Scans all historical datasets in candle_data/ (Aug 2025 -> Sep 2026)
 * Finds Global Optimal Hyperparameters across 1+ full year of market data.
 */

const fs = require('fs');
const path = require('path');
const ConsensusEngineOptimizer = require('../src/consensusOptimizer');

function runMultiYearOptimization() {
    console.log("=========================================================================================");
    console.log("🚀 MULTI-YEAR AI HYPERPARAMETER OPTIMIZER & GLOBAL TRAINER");
    console.log("   Dataset Scope: August 2025 -> September 2026 (1+ Full Year)");
    console.log("=========================================================================================\n");

    const candleDir = path.join(__dirname, '../candle_data');
    const files = fs.readdirSync(candleDir).filter(f => f.endsWith('.json') && f.startsWith('NIFTY_50_5_'));

    // Filter monthly files to avoid duplication
    const monthlyFiles = files.filter(f => {
        return f.includes("2025-08-02_2025-08-16") ||
               f.includes("2025-08-17_2025-08-31") ||
               f.includes("2025-09-01_2025-09-30") ||
               f.includes("2025-10-01_2025-10-31") ||
               f.includes("2025-11-01_2025-11-30") ||
               f.includes("2025-12-01_2025-12-31") ||
               f.includes("2026-01-01_2026-01-31") ||
               f.includes("2026-02-01_2026-02-28") ||
               f.includes("2026-03-01_2026-03-31") ||
               f.includes("2026-04-01_2026-04-30") ||
               f.includes("2026-05-01_2026-05-31") ||
               f.includes("2026-06-01_2026-06-30") ||
               f.includes("2026-07-01_2026-07-31") ||
               f.includes("2026-08-01_2026-08-31") ||
               f.includes("2026-09-01_2026-09-22");
    });

    console.log(`📁 Found ${monthlyFiles.length} Monthly Historical Candle Datasets:`);
    monthlyFiles.forEach(f => console.log(`   - ${f}`));

    // Combine all candles into a master array
    let allCandles = [];
    for (const file of monthlyFiles) {
        const filePath = path.join(candleDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        allCandles = allCandles.concat(data);
    }

    // Sort chronologically by timestamp
    allCandles.sort((a, b) => a.timestamp - b.timestamp);

    // Save combined dataset temporarily
    const masterDatasetPath = path.join(__dirname, '../scratch/master_multi_year_candles.json');
    fs.writeFileSync(masterDatasetPath, JSON.stringify(allCandles));

    console.log(`\n✅ Successfully Merged ${allCandles.length} Candles covering Aug-2025 to Sep-2026!`);
    console.log(`   First Candle: ${allCandles[0].date} ${allCandles[0].time} | Last Candle: ${allCandles[allCandles.length - 1].date} ${allCandles[allCandles.length - 1].time}\n`);

    const optimizer = new ConsensusEngineOptimizer({
        initialCapital: 100000,
        datasetPath: masterDatasetPath
    });

    const report = optimizer.optimize();

    console.log("\n=========================================================================================");
    console.log("🏆 TOP 10 GLOBAL OPTIMAL PARAMETER SETS (1+ YEAR MULTI-MONTH DATASET)");
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
    console.log("🌟 GLOBAL RECOMMENDED BEST HYPERPARAMETERS (1+ YEAR TRAINED)");
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

    // Overwrite strategy config with best global parameters
    const configPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.entryStartTime = best.params.entryStartMins === 610 ? "10:10" : (best.params.entryStartMins === 605 ? "10:05" : "09:55");
        config.entryStartMins = best.params.entryStartMins;
        config.consensusThreshold = best.params.consensusThreshold;
        config.riskRewardRatio = best.params.riskRewardRatio;
        if (!config.indicators) config.indicators = {};
        config.indicators.rvolMin = best.params.rvolMin;
        config.indicators.rsiBullMin = best.params.rsiBullMin;
        config.indicators.rsiBearMax = best.params.rsiBearMax;

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`✅ Automatically applied 1+ Year Trained Best Parameters to strategies_config/consensus_master_head.json!\n`);
    }
}

runMultiYearOptimization();
