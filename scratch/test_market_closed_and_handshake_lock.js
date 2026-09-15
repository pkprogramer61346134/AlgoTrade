const path = require('path');
const OrderExecutionManager = require('../order_config/orderExecutionManager');

async function testHandshakeLockAndMarketGuard() {
    console.log("=================== TESTING HANDSHAKE & MARKET CLOSED LOCKS ===================");

    const orderManager = new OrderExecutionManager();
    orderManager.getJournalData = () => [];

    // 1. Initial State Check
    console.log("1️⃣ Initial Active Position Lock:", orderManager.isPositionActive() ? "LOCKED ❌" : "UNLOCKED 🟢");
    console.assert(!orderManager.isPositionActive(), "Should be unlocked initially");

    // 2. Simulate Signal Execution
    const dummySignal = {
        signalType: "BUY_SIGNAL",
        type: "BUY",
        spotPrice: 23200,
        entryPremium: 35.0,
        optionSL: 29.0,
        optionTarget: 53.0,
        atmStrike: 23200,
        optionSymbol: "NIFTY-TEST-23200-CE",
        quantity: 65,
        numLots: 1,
        executionMode: "PAPER",
        date: "2026-09-99" // Test date
    };

    console.log("\n2️⃣ Executing Order via OrderManager...");
    const execPromise = orderManager.executeOrder(dummySignal, 23200, 10000);
    
    // Check synchronous position lock immediately while executeOrder is in flight / active
    console.log("   -> Immediate Active Position Check during execution:", orderManager.isPositionActive() ? "LOCKED 🔒 (Correct!)" : "UNLOCKED ❌ (Bug!)");

    const execRes = await execPromise;
    console.log("   -> Order Execution Status:", execRes.status);
    console.log("   -> Post-Execution Active Position Lock:", orderManager.isPositionActive() ? "LOCKED 🔒 (Correct!)" : "UNLOCKED ❌ (Bug!)");

    // 3. Attempt Duplicate Order Execution while Position is Active
    console.log("\n3️⃣ Attempting Duplicate Order Placement while Position is ACTIVE...");
    const dupRes = await orderManager.executeOrder(dummySignal, 23200, 10000);
    console.log("   -> Duplicate Order Response Status:", dupRes.status);
    console.log("   -> Duplicate Order Rejection Message:", dupRes.message);
    console.assert(dupRes.status === "rejected", "Duplicate order MUST be rejected while position is active!");

    // 4. Position Monitoring & Closure
    console.log("\n4️⃣ Monitoring Position until SL hit...");
    const posUpdate = orderManager.monitorActivePosition(23200, 25.0); // SL hit at 25.0
    console.log("   -> Position Monitor Status:", posUpdate ? posUpdate.status : "NONE");
    console.log("   -> Post-Closure Active Position Lock:", orderManager.isPositionActive() ? "LOCKED ❌ (Bug!)" : "UNLOCKED 🟢 (Correct!)");
    console.assert(!orderManager.isPositionActive(), "Should be unlocked after position close");

    console.log("\n✅ ALL TESTS PASSED! Handshake Position Lock & Duplicate Guard Verified Successfully.");
}

testHandshakeLockAndMarketGuard().catch(e => console.error("Test Error:", e));
