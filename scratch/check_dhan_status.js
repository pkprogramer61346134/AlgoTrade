const dhan = require('../utility/dhan-orders');

async function main() {
    try {
        const orders = await dhan.getOrders();
        console.log('=== LATEST DHAN ORDERS ===');
        const list = orders?.data?.data || orders?.data || [];
        console.log(JSON.stringify(list.slice(-5), null, 2));

        const pos = await dhan.getPositions();
        console.log('=== CURRENT DHAN POSITIONS ===');
        console.log(JSON.stringify(pos?.data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
