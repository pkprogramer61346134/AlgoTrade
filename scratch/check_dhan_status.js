const { DhanOrders } = require('../utility/dhan-orders');
const dhan = new DhanOrders();

async function main() {
    try {
        console.log('=== DHAN ORDERS FOR NIFTY-Sep2026-22100-PE ===');
        const orders = await dhan.getOrderList();
        const list = orders?.data?.data || orders?.data || [];
        const filtered = list.filter(o => o.securityId === "73870" || o.tradingSymbol?.includes("22100"));
        console.log(JSON.stringify(filtered, null, 2));

        console.log('=== DHAN PENDING / OPEN ORDERS (ANY SYMBOL) ===');
        const pending = list.filter(o => o.orderStatus === "PENDING" || o.orderStatus === "TRIGGER_PENDING" || o.orderStatus === "OPEN");
        console.log(JSON.stringify(pending, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
