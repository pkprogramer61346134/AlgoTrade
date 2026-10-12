const autoShutdownManager = require('../server/masterSL/autoShutdownManager');
const masterSL = require('../server/masterSL/masterSL');
const masterConfig = require('../server/masterSL/config');

async function testAutoShutdownFeature() {
    console.log("=== TESTING AUTO SHUTDOWN MANAGER FEATURE ===");

    // 1. Check module integrity
    console.log("1. Checking masterSL and autoShutdownManager methods...");
    if (typeof masterSL.checkDailyAutoShutdown !== 'function') {
        throw new Error("masterSL.checkDailyAutoShutdown method missing!");
    }
    if (typeof autoShutdownManager.checkAndTriggerShutdown !== 'function') {
        throw new Error("autoShutdownManager.checkAndTriggerShutdown method missing!");
    }
    console.log("✅ Modules and methods verified.");

    // 2. Test guard with open position
    console.log("\n2. Testing safety guard: Open position present...");
    const activePosMock = { status: "OPEN", symbol: "NIFTY_CE" };
    const resOpen = autoShutdownManager.checkAndTriggerShutdown([], activePosMock, { maxTradesPerDay: 3 }, "TEST");
    console.log("Triggered with open position?", resOpen);
    if (resOpen !== false) {
        throw new Error("FAILED: Shutdown should NEVER trigger when active position is open!");
    }
    console.log("✅ Open position guard passed (returned false).");

    // 3. Test trade count < 3 (e.g. 2 trades)
    console.log("\n3. Testing quota not met (2 trades)...");
    const todayStr = new Date().toLocaleDateString("en-CA");
    const twoTrades = [
        { entryDate: todayStr, status: "CLOSED" },
        { entryDate: todayStr, status: "CLOSED" }
    ];
    const resTwo = autoShutdownManager.checkAndTriggerShutdown(twoTrades, null, { maxTradesPerDay: 3 }, "TEST");
    console.log("Triggered with 2 trades?", resTwo);
    if (resTwo !== false) {
        throw new Error("FAILED: Shutdown should not trigger with 2 trades!");
    }
    console.log("✅ Quota guard passed (< 3 trades returned false).");

    // 4. Test trade count >= 3 (3 trades completed)
    console.log("\n4. Testing quota reached (3 trades)...");
    const threeTrades = [
        { entryDate: todayStr, status: "CLOSED" },
        { entryDate: todayStr, status: "CLOSED" },
        { entryDate: todayStr, status: "CLOSED" }
    ];
    const resThree = autoShutdownManager.checkAndTriggerShutdown(threeTrades, null, { maxTradesPerDay: 3, shutdownGraceDelayMs: 60000 }, "TEST");
    console.log("Triggered with 3 trades?", resThree);
    if (resThree !== true) {
        throw new Error("FAILED: Shutdown should trigger when 3 trades completed!");
    }
    console.log("✅ Quota reached trigger passed (returned true).");

    // Check status
    const status = autoShutdownManager.getStatus();
    console.log("Shutdown status:", JSON.stringify(status, null, 2));

    // Cancel test timer
    autoShutdownManager.cancelShutdown();
    console.log("✅ Test timer cancelled safely.");

    console.log("\n🎉 ALL AUTO SHUTDOWN FEATURE TESTS PASSED 100%!");
}

testAutoShutdownFeature().catch(err => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});
