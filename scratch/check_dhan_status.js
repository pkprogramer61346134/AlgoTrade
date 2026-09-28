const { DhanOrders } = require('../utility/dhan-orders');
const dhan = new DhanOrders();

async function main() {
    try {
        console.log('=== LATEST DHAN ORDERS ===');
        const orders = await dhan.getOrderList();
        const list = orders?.data?.data || orders?.data || [];
        if (Array.isArray(list)) {
            console.log(JSON.stringify(list.slice(-5), null, 2));
        } else {
            console.log(JSON.stringify(orders, null, 2));
        }

        console.log('=== CURRENT DHAN POSITIONS ===');
        const pos = await dhan.getPositions();
        console.log(JSON.stringify(pos?.data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
