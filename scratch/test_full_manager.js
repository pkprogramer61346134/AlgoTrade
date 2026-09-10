const OrderExecutionManager = require('../order_config/orderExecutionManager');
const { DhanSDK } = require('../dhanAPI/index');

async function testFullManagerExecution() {
    console.log("==================================================================");
    console.log("🚀 TESTING ORDER EXECUTION MANAGER WITH LIVE DHAN ACCOUNT");
    console.log("==================================================================");

    const dhan = new DhanSDK();
    const manager = new OrderExecutionManager(dhan);

    // 1. Live Capital
    const capital = await manager.fetchLiveCapital();
    console.log(`💰 Live Dhan Capital: ₹${capital}`);

    // 2. Mock Bullish Signal
    const signal = {
        type: "BUY",
        entryPrice: 23429,
        stopLoss: 23399,
        targetPrice: 23474
    };

    console.log("\n⚡ Executing Live Order via OrderExecutionManager...");
    // Force capital match with valid security ID 47305 (NIFTY 23700 CE)
    const result = await manager.executeOrder(signal, 23429, capital);

    console.log("\n📋 [ORDER MANAGER EXECUTION RESULT]:");
    console.log(JSON.stringify(result, null, 2));

    if (result && result.order) {
        console.log("\n--- Testing Trailing SL Modification ---");
        const trailRes = manager.processTickTrailingSL(23445);
        console.log("Trailing SL Result:", trailRes);

        console.log("\n--- Cleaning up: Cancelling/Exiting order ---");
        const cancelRes = await manager.cancelOrder(result.order.orderId);
        console.log("Cancel Result:", cancelRes);
    }
    console.log("==================================================================");
}

testFullManagerExecution().catch(err => console.error(err));
