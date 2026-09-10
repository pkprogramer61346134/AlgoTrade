const { DhanSDK } = require('../dhanAPI/index');

async function checkPendingSuperOrder() {
    const dhan = new DhanSDK();
    const ordersRes = await dhan.orders.getOrderList();
    const orders = ordersRes?.data || [];
    console.log("📋 Current Orders in Dhan Order Book:");
    orders.forEach(o => {
        console.log(`Order #${o.orderId} | Symbol: ${o.tradingSymbol} | Status: ${o.orderStatus} | Price: ₹${o.price} | Qty: ${o.quantity} | Type: ${o.orderType}`);
    });
}

checkPendingSuperOrder();
