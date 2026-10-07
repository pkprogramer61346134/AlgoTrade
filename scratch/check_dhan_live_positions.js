/**
 * Scratch Script: Fetch Live Dhan Broker Positions & Orders
 */
const { DhanOrders } = require("../utility/dhan-orders");
const realTradeEngine = require("../server/realtread/realtread");

async function checkLiveBrokerStatus() {
    console.log("==========================================================================");
    console.log("🔍 FETCHING LIVE DHAN BROKER POSITIONS & ORDER STATUS...");
    console.log("==========================================================================");

    try {
        const orders = new DhanOrders();

        // 1. Fetch Broker Positions
        const posRes = await orders.getPositions();
        console.log("\n📌 [DHAN POSITIONS RESPONSE]:", JSON.stringify(posRes, null, 2));

        // 2. Fetch Broker Order History
        const orderListRes = await orders.getOrders();
        console.log("\n📌 [DHAN RECENT ORDERS LIST]:");
        const orderList = Array.isArray(orderListRes?.data) ? orderListRes.data : (orderListRes?.data?.data || []);
        if (orderList.length === 0) {
            console.log("   No orders found in Dhan order history.");
        } else {
            orderList.slice(0, 10).forEach(o => {
                console.log(`   Order ID: ${o.orderId} | Symbol: ${o.tradingSymbol || o.securityId} | Type: ${o.transactionType} | Status: ${o.orderStatus} | Price: ₹${o.price || o.triggerPrice} | Qty: ${o.quantity}`);
            });
        }

        // 3. Check MasterSL Engine Internal Status
        const status = realTradeEngine.getStatus();
        console.log("\n📌 [MASTERSL ENGINE STATUS]:");
        console.log("   Active Position:", status.activePosition ? JSON.stringify(status.activePosition, null, 2) : "NONE (No active position)");
        console.log("   Trade History Count:", status.totalTrades);
        if (status.history && status.history.length > 0) {
            const lastTrade = status.history[status.history.length - 1];
            console.log("   Last Closed Trade:", JSON.stringify(lastTrade, null, 2));
        }

    } catch (err) {
        console.error("❌ ERROR CHECKING LIVE BROKER STATUS:", err);
    }
}

checkLiveBrokerStatus();
