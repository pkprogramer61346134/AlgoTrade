const { DhanSDK } = require('../dhanAPI/index');

async function placePendingTestOrder() {
    console.log("==================================================================");
    console.log("🚀 PLACING PENDING LIMIT SUPER ORDER ON DHAN FOR USER VERIFICATION");
    console.log("==================================================================");

    const dhan = new DhanSDK();

    // 1. Live Market Quote for 47305 (NIFTY 23700 CE)
    const quoteRes = await dhan.marketData.getMarketQuote([{ exchangeSegment: 'NSE_FNO', securityId: 47305 }]);
    const item = quoteRes?.data?.data?.['NSE_FNO']?.['47305'] || quoteRes?.data?.['NSE_FNO']?.['47305'];
    const ltp = Number(item?.last_price || 36.5);
    console.log(`📈 NIFTY 23700 CE Live Price (LTP): ₹${ltp}`);

    // Set Limit Price significantly below LTP (e.g. ₹20.00) so it remains PENDING
    const pendingLimitPrice = 20.00;
    const stopLossPrice = 10.00;
    const targetPrice = 45.00;

    console.log(`\n📌 Proposed Pending Order Specifications:`);
    console.log(`   - Instrument: NIFTY-Sep2026-23700-CE (Security ID: 47305)`);
    console.log(`   - Current Market Price: ₹${ltp}`);
    console.log(`   - Pending Limit Entry Price: ₹${pendingLimitPrice} (Will NOT execute immediately)`);
    console.log(`   - Attached Stop Loss: ₹${stopLossPrice}`);
    console.log(`   - Attached Target Price: ₹${targetPrice}`);
    console.log(`   - Quantity: 65 units (1 Nifty Lot)`);

    // Payload for Dhan Super Order Endpoint (/super/orders)
    const superPayload = {
        transactionType: "BUY",
        exchangeSegment: "NSE_FNO",
        productType: "INTRADAY",
        orderType: "LIMIT",
        tradingSymbol: "NIFTY-Sep2026-23700-CE",
        securityId: "47305",
        quantity: 65,
        price: pendingLimitPrice,
        targetPrice: targetPrice,
        stopLossPrice: stopLossPrice
    };

    console.log("\n📦 Sending Super Order Payload to Dhan API...");
    const res = await dhan.orders.placeSuperOrder(superPayload);

    console.log("\n📋 [DHAN API RESPONSE]:");
    console.log(JSON.stringify(res, null, 2));

    if (res && res.status === "success") {
        const orderId = res.data?.orderId || res.orderId;
        console.log(`\n🎉 SUCCESS! Super Order #${orderId} is now PENDING on Dhan!`);
        console.log(`👉 Aap Dhan App / Web par Order Book check kar sakte ho. Order #${orderId} @ ₹20.00 Pending mein dikhega!`);
    } else {
        console.log("\n⚠️ Order placement note:", res?.message || res?.errorData);
    }
}

placePendingTestOrder().catch(err => console.error(err));
