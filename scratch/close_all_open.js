const { DhanSDK } = require('../dhanAPI/index');

async function closeAllOpenPositions() {
    const dhan = new DhanSDK();
    const posRes = await dhan.portfolio.getPositions();
    const positions = posRes?.data || [];
    const openPositions = positions.filter(p => p.netQty !== 0);

    console.log(`Found ${openPositions.length} open positions.`);

    for (const p of openPositions) {
        console.log(`Closing position for ${p.tradingSymbol} (SecID: ${p.securityId}, Net Qty: ${p.netQty})...`);
        const payload = {
            transactionType: p.netQty > 0 ? "SELL" : "BUY",
            exchangeSegment: p.exchangeSegment || "NSE_FNO",
            productType: p.productType || "INTRADAY",
            orderType: "MARKET",
            tradingSymbol: p.tradingSymbol,
            securityId: String(p.securityId),
            quantity: Math.abs(p.netQty),
            price: 0,
            validity: "DAY"
        };
        const res = await dhan.orders.placeOrder(payload);
        console.log("Close Result:", res);
    }
}

closeAllOpenPositions();
