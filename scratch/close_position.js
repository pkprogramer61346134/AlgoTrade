const { DhanSDK } = require('../dhanAPI/index');

async function closeLivePosition() {
    console.log("==================================================================");
    console.log("🛑 CLOSING LIVE POSITION FOR SECURITY 47305 (NIFTY 23700 CE)");
    console.log("==================================================================");

    const dhan = new DhanSDK();

    // Check Open Positions
    const posRes = await dhan.portfolio.getPositions();
    console.log("📋 Live Positions from Dhan:", JSON.stringify(posRes, null, 2));

    // Place SELL Market Order to Square Off
    const payload = {
        transactionType: "SELL",
        exchangeSegment: "NSE_FNO",
        productType: "INTRADAY",
        orderType: "MARKET",
        tradingSymbol: "NIFTY-Sep2026-23700-CE",
        securityId: "47305",
        quantity: 65,
        price: 0,
        validity: "DAY"
    };

    console.log("\n📦 Sending Square-Off SELL Order Payload to Dhan API:");
    console.log(JSON.stringify(payload, null, 2));

    const sellRes = await dhan.orders.placeOrder(payload);
    console.log("\n📋 [SQUARE-OFF RESPONSE]:");
    console.log(JSON.stringify(sellRes, null, 2));
}

closeLivePosition().catch(err => console.error(err));
