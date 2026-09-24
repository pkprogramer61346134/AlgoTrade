/**
 * Test & Verification Script for Option Historical Data Utility
 * Path: C:\AlgoTrade\utility\usedcase\test-option-historicaldata.js
 */

const { getCachedOptionCandles, CachedOptionHistoricalData } = require("../usedfull/option-historicaldata");

async function testOptionHistoricalData() {
    console.log("==========================================================================");
    console.log("🧪 TESTING OPTION HISTORICAL DATA UTILITY (option-historicaldata.js)");
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
        // Step 1: Verify Instance & Default Parameters
        console.log("1. Initializing CachedOptionHistoricalData...");
        const optionData = new CachedOptionHistoricalData();
        assert(optionData !== null, "CachedOptionHistoricalData instance initialized");

        // Step 2: Test getCandleData with sample option contract securityId (74068 - NIFTY 24200 CE)
        console.log("\n2. Fetching Option Candles (Date Range Mode)...");
        const resDateRange = await getCachedOptionCandles({
            securityId: "74068",
            exchangeSegment: "NSE_FNO",
            instrument: "OPTIDX",
            interval: "5",
            fromDate: "2026-09-23",
            toDate: "2026-09-23"
        });

        assert(resDateRange.status === "success", "Response status is success");
        assert(resDateRange.securityId === "74068", "Security ID matches 74068");
        assert(Array.isArray(resDateRange.data), "Candle data is an array");
        console.log(`   Fetched ${resDateRange.totalCandles} option candles for ID 74068`);

        // Step 3: Test Candle Count Mode
        console.log("\n3. Fetching Option Candles (Candle Count Mode: count = 50)...");
        const resCountMode = await getCachedOptionCandles({
            securityId: "74068",
            count: 50,
            interval: "5",
            date: "2026-09-23"
        });

        assert(resCountMode.status === "success", "Candle Count response status is success");
        assert(resCountMode.totalCandles > 0, `Returned ${resCountMode.totalCandles} option candles`);

        console.log("\n==========================================================================");
        console.log(`🏆 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
        console.log("==========================================================================");

        if (failed === 0) {
            console.log("🎉 ALL OPTION HISTORICAL DATA UTILITY CHECKS PASSED 100%!");
        }

    } catch (err) {
        console.error("❌ EXCEPTION during option historical data test:", err);
    }
}

testOptionHistoricalData();
