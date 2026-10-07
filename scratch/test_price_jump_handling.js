/**
 * Scratch Script: Test Price Jump & Spike Handling in Trailing Engine
 */
const masterSL = require("../server/masterSL/masterSL");

async function testPriceJumpHandling() {
    console.log("==========================================================================");
    console.log("⚡ TESTING SUDDEN PRICE JUMP & SPIKE HANDLING IN TRAILING SL ENGINE");
    console.log("==========================================================================");

    let passCount = 0;
    let failCount = 0;

    function assert(cond, name) {
        if (cond) {
            console.log(`  ✅ [PASS] ${name}`);
            passCount++;
        } else {
            console.error(`  ❌ [FAIL] ${name}`);
            failCount++;
        }
    }

    // Initialize mock position: Entry ₹100, Target Points ₹100
    masterSL.activePosition = {
        tradeId: "MOCK_JUMP_TEST",
        symbol: "NIFTY_24500_CE",
        status: "OPEN",
        isOptionTrade: true,
        optionType: "CE",
        entryPrice: 100.0,
        initialSl: 95.38,
        currentSl: 95.38,
        targetPrice: 500.0,
        targetPoints: 100.0,
        qty: 65,
        trailingStage: "INITIAL"
    };

    // 1. Send normal tick at ₹105 (no target rule met yet)
    await masterSL.processTick({ liveLtp: 105.0 });
    assert(masterSL.activePosition.currentSl === 95.38, "Tick 1 (LTP ₹105): SL remains Initial ₹95.38 (Below 40% target)");

    // 2. SUDDEN PRICE JUMP SPIKE: Option LTP jumps instantly from ₹105 to ₹300 (Target 200%!)
    console.log("\n🚀 SIMULATING SUDDEN PRICE JUMP SPIKE: Option LTP jumps instantly from ₹105 to ₹300 (+200% Target)...");
    await masterSL.processTick({ liveLtp: 300.0 });

    assert(masterSL.activePosition.currentSl === 266.6, `Price Jump (LTP ₹300): SL instantly jumped to highest tier ₹266.60 (Lock 166.6%)`);
    assert(masterSL.activePosition.trailingStage === "TARGET_200%_LOCK_166.6%", `Trailing stage set to TARGET_200%_LOCK_166.6%`);

    // Reset active position
    masterSL.activePosition = null;

    console.log("==========================================================================");
    console.log(`📊 PRICE JUMP HANDLING TEST: ${passCount} PASSED | ${failCount} FAILED`);
    console.log("==========================================================================");
}

testPriceJumpHandling();
