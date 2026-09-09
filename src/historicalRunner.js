const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { loadAllStrategiesFromJSON } = require('./strategyLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('./dynamicStrategyEngine');
const BacktestEngine = require('../backtest/engine/backtestEngine');
const { generateComparisonReport } = require('../backtest/engine/reportGenerator');

const DATA_DIR = "C:\\candle data";

function runHistoricalBacktestMode() {
    console.log("=========================================================================================");
    console.log("📁 OPTION 1: HISTORICAL DATA MODE (LOADING ALL STRATEGIES FROM strategies_config/*.json)");
    console.log("=========================================================================================\n");

    const jsonStrategies = loadAllStrategiesFromJSON();
    if (jsonStrategies.length === 0) {
        console.error("❌ No valid JSON strategy files found in strategies_config/ directory!");
        return;
    }

    console.log(`📂 Dynamically Loaded ${jsonStrategies.length} JSON Strategies:`);
    jsonStrategies.forEach(s => console.log(`   - [${s.id}] ${s.name} (${s.configFile})`));
    console.log("");

    const allCandles = loadAllCandlesFromDir(DATA_DIR);
    if (!allCandles || allCandles.length === 0) {
        console.error("❌ No candle data found in C:\\candle data!");
        return;
    }

    console.log(`✅ Loaded ${allCandles.length} historical candles from C:\\candle data`);
    console.log(`📅 Date Range: ${allCandles[0].date} to ${allCandles[allCandles.length - 1].date}\n`);

    const reports = [];

    for (const stratConfig of jsonStrategies) {
        console.log(`⏳ Precalculating indicators & Executing: [${stratConfig.name}] ...`);
        const startTime = Date.now();

        const data = prepareJSONStrategyData(allCandles, stratConfig);
        const engine = new BacktestEngine(100000, 1.0);
        const dailyTradeCounts = {};

        for (let i = 0; i < allCandles.length; i++) {
            const candle = allCandles[i];
            engine.checkPositionExit(candle);

            const signal = evaluateJSONStrategy(allCandles, i, stratConfig, data, dailyTradeCounts);
            if (signal && signal.type !== "NONE") {
                engine.executeTrade(signal, candle);
            }
        }

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`   -> Completed [${stratConfig.name}] in ${elapsedSec}s`);

        const report = engine.getReport(stratConfig.name);
        reports.push(report);
    }

    generateComparisonReport(reports);
}

module.exports = { runHistoricalBacktestMode };
