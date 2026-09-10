const OrderExecutionManager = require('../order_config/orderExecutionManager');
const { DhanSDK } = require('../dhanAPI/index');

async function testLiveOrderPlacement() {
    console.log("==================================================================");
    console.log("⚡ TESTING DHAN LIVE ORDER PLACEMENT WITH CAPITAL & STRIKE LOOKUP");
    console.log("==================================================================");

    const dhan = new DhanSDK();
    const orderManager = new OrderExecutionManager(dhan);

    // 1. Fetch Live Balance
    console.log("\n--- STEP 1: Fetch Live Fund Limits from Dhan API ---");
    const capital = await orderManager.fetchLiveCapital();
    console.log(`💰 Live Available Balance: ₹${capital}`);

    // 2. Fetch Spot Price (e.g. Nifty current ~ 23429)
    let spotPrice = 23429;
    try {
        if (dhan.marketData && typeof dhan.marketData.getLtp === 'function') {
            const ltpRes = await dhan.marketData.getLtp(13, 'NSE_IND');
            const liveLtp = ltpRes?.data?.data?.last_price || ltpRes?.data?.last_price || ltpRes?.last_price;
            if (liveLtp) {
                spotPrice = Number(liveLtp);
                console.log(`📈 Live NIFTY Spot Price from Dhan: ₹${spotPrice}`);
            }
        }
    } catch (e) {
        console.log(`ℹ️ Spot price lookup default: ₹${spotPrice}`);
    }

    // 3. Resolve Budget-Matched Option Contract
    console.log("\n--- STEP 2: Resolve Option Contract matching ₹" + capital + " Capital ---");
    const contract = await orderManager.resolveOptionContractFromDhan(spotPrice, "CE", capital);
    console.log(`🎯 Resolved Option Contract:`, contract);

    // 4. Place Live Order
    console.log("\n--- STEP 3: Placing Live Order on Dhan API ---");
    const mockSignal = {
        type: "BUY",
        entryPrice: spotPrice,
        stopLoss: spotPrice - 30,
        targetPrice: spotPrice + 45
    };

    const result = await orderManager.executeOrder(mockSignal, spotPrice, capital);
    console.log("\n📋 [LIVE ORDER RESULT]:");
    console.log(JSON.stringify(result, null, 2));

    // 5. Test Trailing SL Update
    if (result && result.order) {
        console.log("\n--- STEP 4: Testing Trailing SL Modification ---");
        const higherPrice = spotPrice + 15;
        const trailRes = orderManager.processTickTrailingSL(higherPrice);
        console.log("⚡ Trailing SL Check Result:", trailRes);

        // 6. Immediate Cleanup - Cancel Order
        console.log("\n--- STEP 5: Immediate Safety Cleanup (Cancelling Order) ---");
        const cancelRes = await orderManager.cancelOrder(result.order.orderId);
        console.log("🛑 Cancel Result:", cancelRes);
    }

    console.log("\n==================================================================");
    console.log("✅ LIVE ORDER TEST COMPLETED");
    console.log("==================================================================");
}

testLiveOrderPlacement().catch(err => console.error("❌ Test Error:", err));
