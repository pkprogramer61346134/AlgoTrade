/**
 * Test & Verification Script for Option SL & Targets Calculator Utility
 * Path: C:\AlgoTrade\utility\usedcase\test-option-sl-target.js
 */

const { calculateOptionSLAndTargets } = require("../usedfull/option-sl-target");

async function testOptionSLAndTargets() {
    console.log("==========================================================================");
    console.log("🧪 TESTING OPTION SL & TARGETS CALCULATOR UTILITY (option-sl-target.js)");
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
        console.log("1. Calculating Option SL & Targets for NIFTY 24200 CE (Security ID: 74068)...");
        const res = await calculateOptionSLAndTargets({
            securityId: "74068",
            entryPrice: 2.85, // Option Entry LTP ₹2.85
            interval: "5",
            method: "HYBRID"
        });

        assert(res.status === "success", "Response status is success");
        assert(res.entryPrice === 2.85, `Entry Price matches ₹${res.entryPrice}`);
        assert(res.stopLoss.sl < res.entryPrice, `Stop Loss (₹${res.stopLoss.sl}) is below Entry Price (₹${res.entryPrice})`);
        assert(res.targets.tr1.price > res.entryPrice, `Target 1 (₹${res.targets.tr1.price}) is above Entry Price`);
        assert(res.targets.tr2.price > res.targets.tr1.price, `Target 2 (₹${res.targets.tr2.price}) > Target 1 (₹${res.targets.tr1.price})`);
        assert(res.targets.tr3.price > res.targets.tr2.price, `Target 3 (₹${res.targets.tr3.price}) > Target 2 (₹${res.targets.tr2.price})`);
        assert(res.targets.tr4.price > res.targets.tr3.price, `Target 4 (₹${res.targets.tr4.price}) > Target 3 (₹${res.targets.tr3.price})`);

        console.log("\n==========================================================================");
        console.log("📊 CALCULATED OPTION TRADE PARAMETERS:");
        console.log("==========================================================================");
        console.log(`📌 Security ID     : ${res.securityId}`);
        console.log(`💰 Entry Option LTP: ₹${res.entryPrice}`);
        console.log(`📉 Option ATR      : ₹${res.indicators.atr}`);
        console.log(`🔴 Option StopLoss : ₹${res.stopLoss.sl} (${res.stopLoss.slPercent})`);
        console.log(`🟢 Target 1 (TR1)  : ₹${res.targets.tr1.price} (${res.targets.tr1.percent} | Ratio 1:1)`);
        console.log(`🟢 Target 2 (TR2)  : ₹${res.targets.tr2.price} (${res.targets.tr2.percent} | Ratio 1:2)`);
        console.log(`🟢 Target 3 (TR3)  : ₹${res.targets.tr3.price} (${res.targets.tr3.percent} | Ratio 1:3)`);
        console.log(`🟢 Target 4 (TR4)  : ₹${res.targets.tr4.price} (${res.targets.tr4.percent} | Ratio 1:4)`);
        console.log("==========================================================================\n");

        console.log(`🏆 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
        if (failed === 0) {
            console.log("🎉 ALL OPTION SL & TARGETS CALCULATOR CHECKS PASSED 100%!");
        }

    } catch (err) {
        console.error("❌ EXCEPTION during option SL & target test:", err);
    }
}

testOptionSLAndTargets();
