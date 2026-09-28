const { DhanOrders } = require('../utility/dhan-orders');
const dhan = new DhanOrders();

async function main() {
    try {
        console.log('=== LIVE DHAN REAL-TIME POSITIONS ===');
        const posRes = await dhan.getPositions();
        const posList = posRes?.data?.data || posRes?.data || [];
        const openPos = posList.filter(p => p.netQty !== 0);

        if (openPos.length === 0) {
            console.log('No Open Positions on Dhan Broker Account right now.');
        } else {
            for (const p of openPos) {
                console.log(`📌 SYMBOL          : ${p.tradingSymbol}`);
                console.log(`🆔 SECURITY ID     : ${p.securityId}`);
                console.log(`📦 BUY QTY / NET QTY: ${p.buyQty} / ${p.netQty}`);
                console.log(`💵 ENTRY AVG PRICE  : ₹${p.buyAvg}`);
                console.log(`📈 UNREALIZED PNL   : ₹${p.unrealizedProfit}`);
                console.log(`-------------------------------------------`);
            }
        }

        console.log('\n=== LATEST ORDERS IN DHAN BOOK ===');
        const ordersRes = await dhan.getOrderList();
        const orderList = ordersRes?.data?.data || ordersRes?.data || [];
        const lastOrder = orderList[orderList.length - 1];
        if (lastOrder) {
            console.log(`🆔 Order ID       : ${lastOrder.orderId}`);
            console.log(`📌 Symbol         : ${lastOrder.tradingSymbol}`);
            console.log(`⚡ Status         : ${lastOrder.orderStatus}`);
            console.log(`💵 Price / Avg    : ₹${lastOrder.price} / ₹${lastOrder.averageTradedPrice}`);
            console.log(`🕒 Create Time    : ${lastOrder.createTime}`);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
