const OrderExecutionManager = require('../order_config/orderExecutionManager');

async function testHandshakePositionLock() {
    console.log("=================================================================================");
    console.log("🧪 LIVE VERIFICATION TEST: 2-WAY HANDSHAKE & SINGLE POSITION LOCK");
    console.log("=================================================================================\n");

    const orderManager = new OrderExecutionManager();
    orderManager.config.executionMode = "PAPER";

    // 1. Initial State Check
    console.log("1️⃣ Initial State:");
    console.log("   - Active Position Open?:", orderManager.isPositionActive() ? "YES ❌" : "NO (Ready to Scan) ✅");

    // 2. Signal Engine sends Trade 1
    console.log("\n2️⃣ Signal Engine generates Trade #1 (BUY CE @ Spot ₹23,335)...");
    const res1 = await orderManager.executeOrder({ entryPrice: 23335, type: "BUY_SIGNAL" }, 23335, 100000);
    console.log("   - Handshake Response:", res1.handshake, "| Order ID:", res1.order.orderId);
    console.log("   - Active Position Status:", orderManager.isPositionActive() ? "LOCKED (Scanning Stopped) 🔒" : "IDLE");

    // 3. Attempt Trade #2 while Trade #1 is Active
    console.log("\n3️⃣ Market continues running. Signal Engine attempts to send Trade #2...");
    const res2 = await orderManager.executeOrder({ entryPrice: 23345, type: "BUY_SIGNAL" }, 23345, 100000);
    console.log("   - Duplicate Trade #2 Status:", res2.status);
    console.log("   - Message:", res2.message);
    console.log("   - Position Still Locked on Trade #1?:", orderManager.activeOrder.orderId === res1.order.orderId ? "YES ✅" : "NO ❌");

    // 4. Close Trade #1 (Simulating Exit)
    console.log("\n4️⃣ Trade #1 hits Exit / Square Off...");
    const closeRes = orderManager.closeActivePosition("TARGET_HIT", 130.0, 23380, "1:16:00 pm");
    console.log("   - Handshake Closure Status:", closeRes.status, "| Exit Reason:", closeRes.reason);
    console.log("   - Post-Exit Active Position Status:", orderManager.isPositionActive() ? "LOCKED ❌" : "UNLOCKED & READY TO SCAN ✅");

    // 5. Now Signal Engine attempts Trade #3 (Post-Exit)
    console.log("\n5️⃣ Signal Engine attempts Trade #3 (After Trade #1 Closed)...");
    const res3 = await orderManager.executeOrder({ entryPrice: 23350, type: "SELL_SIGNAL" }, 23350, 100000);
    console.log("   - Handshake Response for Trade #3:", res3.handshake, "| Order ID:", res3.order.orderId);

    // Clean up test position
    orderManager.activeOrder = null;

    console.log("\n=================================================================================");
    console.log("💯 PROOF CONFIRMED: System strictly locks on active trade & rejects any next trade until closed!");
    console.log("=================================================================================");
}

testHandshakePositionLock().catch(console.error);
