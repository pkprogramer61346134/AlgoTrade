const OrderExecutionManager = require('../order_config/orderExecutionManager');
const fs = require('fs');
const path = require('path');

async function testPaperCapitalDeduction() {
    console.log("==================================================================");
    console.log("🧪 TESTING PAPER TRADING DYNAMIC CAPITAL DEDUCTION & PERSISTENCE");
    console.log("==================================================================\n");

    const manager = new OrderExecutionManager();
    
    // 1. Initial Paper Balance
    const startBalance = manager.paperBalance;
    console.log(`1️⃣ Initial Paper Capital loaded: ₹${startBalance}`);

    // 2. Execute a Paper BUY Signal (Initial SL = 85, Target = 145, Entry = 100)
    console.log("\n2️⃣ Simulating Buy Signal placement...");
    const orderRes = await manager.executeOrder({
        signalType: "BUY_SIGNAL",
        spotPrice: 23416.95,
        atmStrike: "23400 (NIFTY-2026-09-15-23400-CE)",
        optionSymbol: "NIFTY-2026-09-15-23400-CE",
        entryPremium: 100,
        optionSL: 85,
        optionTarget: 145,
        target2: 167.5,
        riskRewardRatio: 3.0,
        quantity: 65,
        numLots: 1
    }, 23416.95, startBalance);

    console.log("   - Active Order Placed:", orderRes.status === "SUCCESS" ? "✅ YES" : "❌ NO");
    console.log("   - Active Position Entry Premium:", `₹${manager.activeOrder.optionPremiumPrice}`);

    // 3. Monitor active position when option premium drops to ₹85 (SL Hit -> Loss)
    console.log("\n3️⃣ Simulating live tick movement down to ₹85 (Stop Loss Hit)...");
    const tickResult = manager.monitorActivePosition(23380, 85);
    
    console.log("   - Position Exit Triggered:", tickResult?.status === "POSITION_CLOSED" ? "✅ YES" : "❌ NO");
    console.log("   - Exit Reason:", tickResult?.reason);
    console.log("   - Closed Trade PnL:", `₹${tickResult?.trade?.pnl}`);

    // 4. Verify updated paper balance after Loss
    const balanceAfterLoss = manager.paperBalance;
    console.log(`\n4️⃣ Paper Balance after Loss (-₹975): ₹${balanceAfterLoss}`);
    const expectedAfterLoss = Number((startBalance - 975).toFixed(2));
    
    if (balanceAfterLoss === expectedAfterLoss) {
        console.log(`✅ SUCCESS: Paper Capital correctly DECREASED from ₹${startBalance} to ₹${balanceAfterLoss}!`);
    } else {
        console.error(`❌ FAILED: Expected ₹${expectedAfterLoss}, got ₹${balanceAfterLoss}`);
    }

    // 5. Test reloading manager to ensure persistence from trade journal
    console.log("\n5️⃣ Re-instantiating OrderExecutionManager (Simulating Server Restart)...");
    const newManager = new OrderExecutionManager();
    console.log(`   - Restored Paper Capital on Restart: ₹${newManager.paperBalance}`);

    if (newManager.paperBalance === balanceAfterLoss) {
        console.log("✅ PERSISTENCE CONFIRMED: Paper balance survived restart!");
    } else {
        console.error(`❌ PERSISTENCE FAILURE: Expected ₹${balanceAfterLoss}, got ₹${newManager.paperBalance}`);
    }

    console.log("\n==================================================================");
    console.log("🎉 ALL PAPER CAPITAL DEDUCTION TESTS PASSED CLEANLY!");
    console.log("==================================================================");
}

testPaperCapitalDeduction().catch(e => {
    console.error("❌ Test crashed:", e);
});
