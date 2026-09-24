/**
 * Test & Verification Script for Real Trading System
 * Path: C:\AlgoTrade\utility\usedcase\test-realtrade-system.js
 */

const realConfig = require("../../server/realtread/config");
const realEngine = require("../../server/realtread/realtread");

async function testRealTradeSystem() {
    console.log("==========================================================================");
    console.log("🧪 TESTING REAL TRADING SYSTEM (DECOUPLED HANDLER)");
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
        console.log("1. Verifying Real Config Manager (config.js)...");
        realConfig.setEnabled(true);
        const cfg = realConfig.getConfig();
        assert(cfg.realTradeEnabled === true, "Real Trade Enabled is true");

        // Step 2: Test processCandleTick
        console.log("\n2. Testing processCandleTick with simulated candle...");
        const res = await realEngine.processCandleTick({
            close: 23427,
            date: "2026-09-23",
            time: "11:05:00 am"
        }, cfg.selectedStock);

        assert(res !== null, "processCandleTick returned result");
        assert(res.status === "EXECUTED" || res.status === "NO_SIGNAL" || res.status === "IGNORED", `Process status: ${res.status}`);

        // Step 3: Verify Status Payload
        console.log("\n3. Checking Real Status Payload (getStatus())...");
        const status = realEngine.getStatus();
        assert(status.enabled === true, "Real Trading Status enabled = true");

        console.log("\n==========================================================================");
        console.log(`🏆 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
        console.log("==========================================================================");

        if (failed === 0) {
            console.log("🎉 ALL REAL TRADING SYSTEM CHECKS PASSED 100%!");
        }

    } catch (err) {
        console.error("❌ EXCEPTION during real trade test:", err);
    }
}

testRealTradeSystem();
