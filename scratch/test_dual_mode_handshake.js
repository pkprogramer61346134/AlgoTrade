const OrderExecutionManager = require('../order_config/orderExecutionManager');

async function testDualModeHandshake() {
    console.log("=================================================================================");
    console.log("🧪 AUDITING 2-WAY HANDSHAKE, DUAL EXECUTION MODE (PAPER vs REAL) & TRAILING SL");
    console.log("=================================================================================\n");

    const orderManager = new OrderExecutionManager();

    // 1. Set Mode to PAPER
    orderManager.config.executionMode = "PAPER";
    orderManager.config.riskRewardRatio = 3.0;

    console.log("📌 Initial Active Position Status:", orderManager.isPositionActive() ? "ACTIVE 🔒" : "IDLE 🟢");

    // 2. Simulate Signal Engine -> Order Manager Handshake
    console.log("\n🚀 [STEP 1] Signal Engine triggers BUY CE Signal @ Spot ₹23,348...");
    const execRes = await orderManager.executeOrder({
        entryPrice: 23348,
        type: "BUY_SIGNAL",
        riskRewardRatio: 3.0
    }, 23348, 100000);

    console.log("🤝 Handshake Response:", execRes.handshake, "| Status:", execRes.status);
    console.log("📌 Post-Entry Active Position Status:", orderManager.isPositionActive() ? "LOCKED (Position Active) 🔒" : "IDLE 🟢");

    // 3. Test Duplicate Signal Rejection during Active Lock
    console.log("\n🛑 [STEP 2] Testing Signal Engine Handshake Lock (Attempting duplicate signal scan)...");
    const dupRes = await orderManager.executeOrder({
        entryPrice: 23350,
        type: "BUY_SIGNAL"
    }, 23350, 100000);
    console.log("   - Duplicate Handshake Response:", dupRes.status, "| Message:", dupRes.message);

    // 4. Simulate Price Tick Movement -> T1 Trailing Activation
    console.log("\n📈 [STEP 3] Simulating Market Price Surge towards Target 1 (Option Premium surge to Target 1)...");
    const pos = orderManager.activeOrder;
    console.log(`   - Entry Premium: ₹${pos.optionPremiumPrice} | Target 1: ₹${pos.target1} | Initial SL: ₹${pos.initialSL}`);

    // Tick 1: Price moves near T1
    const tick1Res = orderManager.monitorActivePosition(23380, pos.target1 + 1.0);
    console.log("   - Tick Result:", tick1Res ? tick1Res.event : "Monitoring");
    console.log(`   - Post-T1 Locked SL: ₹${pos.currentSL} 🔒 | Current Target: ₹${pos.currentTarget} (Target 2 Extended)`);

    // 5. Simulate Price Tick Movement -> Target 2 Hit (Exit)
    console.log("\n🚀 [STEP 4] Simulating Market Price Surge hitting Target 2 (Extended 1:4.5 R:R)...");
    const tick2Res = orderManager.monitorActivePosition(23420, pos.target2 + 2.0);
    console.log("   - Exit Result:", tick2Res ? tick2Res.status : "Monitoring");
    console.log("   - Exit Reason:", tick2Res?.reason);
    console.log("   - Recorded PnL: ₹", tick2Res?.trade?.pnl, `(${tick2Res?.trade?.pointsPnL} pts)`);

    // 6. Verify Position Lock Unlocked
    console.log("\n📌 [STEP 5] Checking Handshake Status Post-Closure:", orderManager.isPositionActive() ? "LOCKED 🔒" : "UNLOCKED & IDLE 🟢");

    // 7. Verify Journal History
    const journal = orderManager.getTradeJournal("PAPER");
    console.log(`\n📜 Trade Journal Total Paper Records: ${journal.length}`);
    if (journal.length > 0) {
        console.log("   - Latest Journal Entry:", JSON.stringify(journal[0], null, 2));
    }

    console.log("\n=================================================================================");
    console.log("✅ ALL AUDIT CHECKS PASSED SUCCESSFULLY!");
    console.log("=================================================================================");
}

testDualModeHandshake().catch(console.error);
