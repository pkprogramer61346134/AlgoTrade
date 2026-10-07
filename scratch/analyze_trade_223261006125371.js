const { DhanOrders } = require("../utility/dhan-orders");

async function analyzeTrade() {
    console.log("=== DEEP TRADE ANALYZER FOR ORDER 223261006125371 ===");
    const orders = new DhanOrders();

    try {
        // 1. Fetch Order details from Dhan
        console.log("\n1. Fetching Order List from Dhan API...");
        const orderListRes = await orders.getOrders();
        const orderList = Array.isArray(orderListRes?.data) ? orderListRes.data : (orderListRes?.data?.data || []);
        
        const targetOrder = orderList.find(o => String(o.orderId) === "223261006125371" || String(o.orderId).includes("223261006125371"));
        console.log("Target Order Found on Dhan:", JSON.stringify(targetOrder || "NOT FOUND IN ACTIVE ORDERS LIST", null, 2));

        // 2. Fetch All Positions
        console.log("\n2. Fetching Positions List from Dhan API...");
        const posRes = await orders.getPositions();
        const posList = Array.isArray(posRes?.data) ? posRes.data : (posRes?.data?.data || []);
        console.log("Positions on Dhan:", JSON.stringify(posList, null, 2));

        // 3. Fetch Historical Trades from Dhan
        console.log("\n3. Fetching Trade History from Dhan API...");
        const tradeRes = await orders.getTradeHistory();
        const tradeList = Array.isArray(tradeRes?.data) ? tradeRes.data : (tradeRes?.data?.data || []);
        const targetTrades = tradeList.filter(t => String(t.orderId) === "223261006125371");
        console.log("Trades for Order 223261006125371:", JSON.stringify(targetTrades, null, 2));

    } catch (err) {
        console.error("Error during trade analysis:", err);
    }
}

analyzeTrade();
