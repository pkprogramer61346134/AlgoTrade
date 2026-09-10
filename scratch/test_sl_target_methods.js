const { DhanSDK } = require('../dhanAPI/index');

async function testSLTargetMethods() {
    console.log("==================================================================");
    console.log("⚡ TESTING DHAN STOP-LOSS AND TARGET ORDER PLACEMENT METHODS");
    console.log("==================================================================");

    const dhan = new DhanSDK();

    // 1. Get Live Quote for 47305 (NIFTY 23700 CE)
    const quoteRes = await dhan.marketData.getMarketQuote([{ exchangeSegment: 'NSE_FNO', securityId: 47305 }]);
    const item = quoteRes?.data?.data?.['NSE_FNO']?.['47305'] || quoteRes?.data?.['NSE_FNO']?.['47305'];
    const ltp = Number(item?.last_price || 36.1);
    console.log(`📈 Security 47305 Live Price: ₹${ltp}`);

    const slPrice = Number((ltp - 15).toFixed(2));
    const targetPrice = Number((ltp + 25).toFixed(2));

    console.log(`🎯 Proposed SL: ₹${slPrice} | Proposed Target: ₹${targetPrice}`);

    // METHOD A: Test Super Order (/super/orders)
    console.log("\n--- METHOD A: Testing Super Order (/super/orders) ---");
    const superPayload = {
        transactionType: "BUY",
        exchangeSegment: "NSE_FNO",
        productType: "INTRADAY",
        orderType: "LIMIT",
        securityId: "47305",
        quantity: 65,
        price: ltp,
        targetPrice: targetPrice,
        stopLossPrice: slPrice
    };
    console.log("Super Order Payload:", superPayload);
    const superRes = await dhan.orders.placeSuperOrder(superPayload);
    console.log("Super Order Response:", JSON.stringify(superRes, null, 2));

    // METHOD B: Test Regular Stop-Loss Market Order (/orders with orderType: STOP_LOSS_MARKET)
    console.log("\n--- METHOD B: Testing Separate SL-M Order (/orders) ---");
    const slPayload = {
        transactionType: "SELL",
        exchangeSegment: "NSE_FNO",
        productType: "INTRADAY",
        orderType: "STOP_LOSS_MARKET",
        securityId: "47305",
        quantity: 65,
        price: 0,
        triggerPrice: slPrice
    };
    console.log("SL Order Payload:", slPayload);
    const slRes = await dhan.orders.placeOrder(slPayload);
    console.log("SL Order Response:", JSON.stringify(slRes, null, 2));

    if (slRes && slRes.data && slRes.data.orderId) {
        console.log(`\n🛑 Cleaning up SL Order #${slRes.data.orderId}...`);
        const cancelSL = await dhan.orders.cancelOrder(slRes.data.orderId);
        console.log("Cancel SL Result:", cancelSL);
    }
}

testSLTargetMethods().catch(err => console.error(err));
