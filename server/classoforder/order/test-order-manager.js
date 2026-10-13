
const orderManager = require('./order-manager');

async function testSuperOrder() {
    console.log('\n========== SUPER ORDER TEST ==========');

    const orderDetails = {
        securityId: 'YOUR_SECURITY_ID',
        exchangeSegment: 'NSE_FNO',
        transactionType: 'BUY',
        lots: 1,
        lotSize: 65,

        // 0 = Market Order in the current executor logic
        price: 0,

        // Example values only — verify before live trading
        targetPrice: 100,
        stopLossPrice: 60,
        trailingJump: 5
    };

    try {
        const result = await orderManager.placeSuperOrder(orderDetails);

        console.log(
            '\nSUPER ORDER RESULT:\n',
            JSON.stringify(result, null, 2)
        );
    } catch (error) {
        console.error('\nSUPER ORDER FAILED:', error.message);
        process.exitCode = 1;
    }
}

testSuperOrder();
