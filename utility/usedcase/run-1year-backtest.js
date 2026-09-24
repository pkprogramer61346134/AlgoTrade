/**
 * 1-Year Historical Backtest Runner (2025-09-25 to 2026-09-24)
 * Path: C:\AlgoTrade\utility\usedcase\run-1year-backtest.js
 */

const backtestEngine = require("../../server/backtesting/backtesting");

async function run1YearBacktest() {
    console.log("==========================================================================");
    console.log("🚀 RUNNING 1-YEAR HISTORICAL BACKTEST (2025-09-25 to 2026-09-24)");
    console.log("==========================================================================\n");

    try {
        const report = await backtestEngine.runBacktest({
            fromDate: "2025-09-25",
            toDate: "2026-09-24",
            initialBalance: 100000,
            lots: 1,
            lotSize: 65,
            interval: "5"
        });

        console.log("✅ [1-YEAR BACKTEST COMPLETED] Report generated successfully.");
    } catch (err) {
        console.error("❌ Exception running 1-year backtest:", err.message);
    }
}

run1YearBacktest();
