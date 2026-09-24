/**
 * Test & Verification Script for Backtesting Engine
 * Path: C:\AlgoTrade\utility\usedcase\test-backtest-system.js
 */

const backtestEngine = require("../../server/backtesting/backtesting");
const backtestConfig = require("../../server/backtesting/config");

async function testBacktestSystem() {
    console.log("==========================================================================");
    console.log("🧪 TESTING BACKTESTING SYSTEM (HISTORICAL DATA ENGINE)");
    console.log("==========================================================================\n");

    let passed = 0;
    let failed = 0;

    function assert(cond, msg) {
        if (cond) {
            console.log(`  ✅ PASSED: ${msg}`);
            passed++;
        } else {
            console.error(`  ❌ FAILED: ${msg}`);
            failed++;
        }
    }

    try {
        // Step 1: Verify config.js
        console.log("1. Verifying Backtest Config Manager (config.js)...");
        const cfg = backtestConfig.getConfig();
        assert(cfg.initialBalance === 100000, `Initial Virtual Balance is ₹${cfg.initialBalance}`);
        assert(cfg.lots === 1, `Default Lot count is ${cfg.lots}`);

        // Step 2: Run Backtest for sample date range (2026-09-18 to 2026-09-23)
        console.log("\n2. Running Backtest across historical candles (2026-09-18 to 2026-09-23)...");
        const report = await backtestEngine.runBacktest({
            fromDate: "2026-09-18",
            toDate: "2026-09-23",
            initialBalance: 100000,
            lots: 1,
            lotSize: 65,
            interval: "5"
        });

        assert(report.status === "success", "Backtest report status is success");
        assert(report.symbol === "NIFTY", "Report symbol is NIFTY");
        assert(Array.isArray(report.trades), "Report contains trades array");
        assert(report.stats.totalTrades >= 0, `Total Trades evaluated: ${report.stats.totalTrades}`);
        assert(typeof report.finalBalance === "number", `Final Balance: ₹${report.finalBalance}`);

        console.log("\n==========================================================================");
        console.log(`🏆 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
        console.log("==========================================================================");

        if (failed === 0) {
            console.log("🎉 ALL BACKTESTING SYSTEM CHECKS PASSED 100%!");
        }

    } catch (err) {
        console.error("❌ EXCEPTION during backtest test:", err);
    }
}

testBacktestSystem();
