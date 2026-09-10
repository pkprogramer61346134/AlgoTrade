const { DhanSDK } = require('../dhanAPI/index');

async function checkAndCleanOrders() {
    const dhan = new DhanSDK();
    console.log("Checking Order Book & Positions...");

    const ordersRes = await dhan.orders.getOrderList();
    const orders = ordersRes?.data || [];
    console.log(`Found ${orders.length} orders in Order Book.`);

    const pendingOrders = orders.filter(o => o.orderStatus === 'PENDING' || o.orderStatus === 'TRIGGER_PENDING' || o.orderStatus === 'TRANSIT');
    console.log(`Pending / Active Orders: ${pendingOrders.length}`);

    for (const o of pendingOrders) {
        console.log(`Cancelling Pending Order #${o.orderId} (${o.tradingSymbol})...`);
        try {
            const cRes = await dhan.orders.cancelOrder(o.orderId);
            console.log("Cancel Result:", cRes);
        } catch (e) {}
    }

    const posRes = await dhan.portfolio.getPositions();
    console.log("Current Net Positions:", posRes?.data?.filter(p => p.netQty !== 0) || "No Open Positions (Net 0)");
}

checkAndCleanOrders();
