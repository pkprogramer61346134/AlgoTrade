const masterSL = require('../server/masterSL/masterSL');
const autoShutdownManager = require('../server/masterSL/autoShutdownManager');

async function testFull3TradesLifecycle() {
    console.log("=== SIMULATING 3 FULL TRADES CLOSING IN SEQUENCE ===");
    
    // Clear state
    autoShutdownManager.cancelShutdown();
    masterSL.tradeHistory = [];
    masterSL.activePosition = null;

    const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    for (let i = 1; i <= 3; i++) {
        console.log(`\n--- Trade ${i} ---`);
        masterSL.activePosition = {
            tradeId: `SIM_ORD_00${i}`,
            symbol: "NIFTY_22200_CE",
            optionType: "CE",
            isOptionTrade: true,
            entryDate: todayDate,
            entryTime: "10:00:00",
            entryPrice: 100,
            initialSl: 95,
            currentSl: 95,
            targetPrice: 200,
            qty: 65,
            status: "OPEN",
            handlers: {}
        };

        const closed = await masterSL.closePosition(110, "TARGET_HIT", "TEST");
        console.log(`Trade ${i} closed status:`, closed ? closed.status : "null");
        console.log(`Today trades count:`, autoShutdownManager.todayTradesCount);
    }

    const finalStatus = autoShutdownManager.getStatus();
    console.log("\nFinal Shutdown Manager Status:", finalStatus);

    if (finalStatus.isShutdownInitiated && finalStatus.todayTradesCount === 3) {
        console.log("✅ 3 TRADES AUTO SHUTDOWN VERIFICATION: 100% SUCCESS!");
    } else {
        throw new Error("FAILED: Auto shutdown was not initiated after 3 trades!");
    }

    autoShutdownManager.cancelShutdown();
}

testFull3TradesLifecycle().catch(err => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});
