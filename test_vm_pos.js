const { DhanOrders } = require('./utility/dhan-orders');
const { ensureValidDhanToken } = require('./utility/token/autoTokenRefresh');

async function testVMPos() {
    await ensureValidDhanToken();
    const orders = new DhanOrders();
    const res = await orders.getPositions();
    console.log("=== RAW DHAN POSITIONS RESPONSE ===");
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
}

testVMPos();
