const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const BacktestEngine = require('./engine/backtestEngine');
const { generateComparisonReport } = require('./engine/reportGenerator');

// Strategies
const { prepareSupertrendEMAData, evaluateSupertrendEMA } = require('./strategies/supertrendEMA');
const { prepareORBData, evaluateORBBreakout } = require('./strategies/orbBreakout');
const { prepareVWAPData, evaluateVWAPReversion } = require('./strategies/vwapMeanReversion');
const { prepareMACDData, evaluateMACDDivergence } = require('./strategies/macdDivergence');
const { prepareComboData, evaluateComboStrategy } = require('./strategies/comboStrategy');
const { prepareInstitutionalHighWinRateData, evaluateInstitutionalHighWinRate } = require('./strategies/institutionalHighWinRate');

const DATA_DIR = "C:\\candle data";

function runMasterBacktest() {
    console.log("=========================================================================================");
    console.log("📁 LOADING HISTORICAL CANDLE DATA FROM C:\\candle data ...");
    console.log("=========================================================================================\n");

    const allCandles = loadAllCandlesFromDir(DATA_DIR);
    if (!allCandles || allCandles.length === 0) {
        console.error("❌ No candle files found in C:\\candle data!");
        return;
    }

    console.log(`✅ Loaded ${allCandles.length} candles spanning trading sessions!`);
    console.log(`📅 Date Range: ${allCandles[0].date} to ${allCandles[allCandles.length - 1].date}\n`);

    const strategies = [
        { name: "Supertrend + EMA Crossover", prep: prepareSupertrendEMAData, fn: evaluateSupertrendEMA },
        { name: "15-Min ORB Breakout", prep: prepareORBData, fn: evaluateORBBreakout },
        { name: "VWAP Reversion", prep: prepareVWAPData, fn: evaluateVWAPReversion },
        { name: "MACD Momentum Reversal", prep: prepareMACDData, fn: evaluateMACDDivergence },
        { name: "Multi-Filter Combo Strategy", prep: prepareComboData, fn: evaluateComboStrategy },
        { name: "High Win-Rate Institutional Strategy", prep: prepareInstitutionalHighWinRateData, fn: evaluateInstitutionalHighWinRate }
    ];

    const reports = [];

    for (const strat of strategies) {
        console.log(`⏳ Precalculating indicators & Backtesting: [${strat.name}] ...`);
        const startTime = Date.now();

        const indicatorsData = strat.prep(allCandles);
        const engine = new BacktestEngine(100000, 1.0); // Initial Capital: ₹1,00,000, 1% Risk per trade

        for (let i = 0; i < allCandles.length; i++) {
            const candle = allCandles[i];
            
            // Check active position exit first
            engine.checkPositionExit(candle);

            // Evaluate strategy entry signal
            const signal = strat.fn(allCandles, i, indicatorsData);
            if (signal && signal.type !== "NONE") {
                engine.executeTrade(signal, candle);
            }
        }

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`   -> Finished [${strat.name}] in ${elapsedSec}s`);

        const report = engine.getReport(strat.name);
        reports.push(report);
    }

    // Print final comparison report table
    generateComparisonReport(reports);
}

if (require.main === module) {
    runMasterBacktest();
}

module.exports = { runMasterBacktest };
