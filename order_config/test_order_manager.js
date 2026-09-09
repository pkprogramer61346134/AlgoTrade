const OrderExecutionManager = require('./orderExecutionManager');

async function runTest() {
    console.log("=========================================================================================");
    console.log("🧪 TESTING ORDER EXECUTION MANAGER & DYNAMIC TRAILING SL JUMPS");
    console.log("=========================================================================================\n");

    const manager = new OrderExecutionManager();

    // Test 1: Capital Usage Quantity Calculation (50% vs 100%)
    console.log("📌 TEST 1: Capital Allocation Quantity Sizing");
    const qty50 = manager.calculateQuantity(100000, 200);
    console.log(`   - 50% Capital Usage on ₹1,00,000 @ ₹200/unit: ${qty50} units (Allocated: ₹50,000)`);

    manager.config.capitalUsagePct = 100;
    const qty100 = manager.calculateQuantity(100000, 200);
    console.log(`   - 100% Capital Usage on ₹1,00,000 @ ₹200/unit: ${qty100} units (Allocated: ₹100,000)`);
    manager.config.capitalUsagePct = 50; // Reset

    // Test 2: Order Execution & Target Lock (Entry ₹100, SL ₹90, Target ₹115)
    console.log("\n📌 TEST 2: Order Execution & Target Hit Lock");
    const signal = { type: "BUY", entryPrice: 100, stopLoss: 90, targetPrice: 115 };
    await manager.executeOrder(signal, 100, 100000);

    console.log("\n📌 TEST 3: Simulating Price Movements & Trailing SL Jumps");

    // Price moves to 110 (Below target 115)
    console.log("\n--- Price moves to ₹110 ---");
    let update = manager.processTickTrailingSL(110);
    console.log(`   Current SL: ₹${manager.activeOrder.currentSL} | Target Reached: ${manager.activeOrder.targetReached}`);

    // Price reaches Target 115!
    console.log("\n--- Price reaches Target ₹115! ---");
    update = manager.processTickTrailingSL(115);
    console.log(`   Current SL: ₹${manager.activeOrder.currentSL} | Target Reached: ${manager.activeOrder.targetReached}`);

    // Price jumps to 125 (+10 pts)
    console.log("\n--- Price jumps to ₹125! ---");
    update = manager.processTickTrailingSL(125);
    console.log(`   Current SL: ₹${manager.activeOrder.currentSL}`);

    // Price jumps to 135 (+10 pts)
    console.log("\n--- Price jumps to ₹135! ---");
    update = manager.processTickTrailingSL(135);
    console.log(`   Current SL: ₹${manager.activeOrder.currentSL}`);

    console.log("\n=========================================================================================");
    console.log("✅ ORDER MANAGER & TRAILING SL TEST COMPLETED SUCCESSFULLY!");
    console.log("=========================================================================================");
}

runTest();
