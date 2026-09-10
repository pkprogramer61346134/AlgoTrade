const { DhanSDK } = require('../dhanAPI/index');

async function testLiveRealOrder() {
    console.log("==================================================================");
    console.log("🚀 TESTING REAL DHAN LIVE ORDER WITH VALID SECURITY ID (47305)");
    console.log("==================================================================");

    const dhan = new DhanSDK();

    // Fetch Fund Limits
    const fundRes = await dhan.funds.getFundLimits();
    console.log("💰 Fund Limits:", fundRes?.data?.data || fundRes?.data);

    // 1. Get Live Quote for 47305 (NIFTY 23700 CE)
    const quoteRes = await dhan.marketData.getMarketQuote([{ exchangeSegment: 'NSE_FNO', securityId: 47305 }]);
    const item = quoteRes?.data?.data?.['NSE_FNO']?.['47305'] || quoteRes?.data?.['47305'];
    const ltp = item?.last_price || 37.85;
    console.log(`📈 Security 47305 Live Price: ₹${ltp}`);

    // 2. Prepare Order Payload for Dhan HQ v2
    const payload = {
        transactionType: "BUY",
        exchangeSegment: "NSE_FNO",
        productType: "INTRADAY",
        orderType: "MARKET",
        tradingSymbol: "NIFTY-Sep2026-23700-CE",
        securityId: "47305",
        quantity: 65, // 1 Nifty Lot = 65 units in 2026
        price: 0, // MARKET order price must be 0
        validity: "DAY"
    };

    console.log("\n📦 Sending Live Order Payload to Dhan API:");
    console.log(JSON.stringify(payload, null, 2));

    const res = await dhan.orders.placeOrder(payload);
    console.log("\n📋 [DHAN API PLACE ORDER RESPONSE]:");
    console.log(JSON.stringify(res, null, 2));

    // If order was placed, check order status & cancel it immediately to avoid risk
    if (res && res.data && (res.data.orderId || res.data.data?.orderId)) {
        const orderId = res.data.orderId || res.data.data?.orderId;
        console.log(`\n🛑 Immediate Cleanup: Cancelling Order #${orderId}...`);
        const cancelRes = await dhan.orders.cancelOrder(orderId);
        console.log("Cancel Response:", JSON.stringify(cancelRes, null, 2));
    } else if (res && res.errorData) {
        console.log("\n⚠️ Response remarks / error details:", res.errorData);
    }
}

testLiveRealOrder().catch(err => console.error(err));
