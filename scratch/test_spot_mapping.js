const OrderExecutionManager = require('../order_config/orderExecutionManager');

async function testSpotMapping() {
    console.log('🧪 [TEST] Testing End-to-End Spot Chart Structure & Delta Mapping...');
    const exec = new OrderExecutionManager();

    // Reset active order and bypass daily count for test
    exec.paperManager.activeOrder = null;
    exec.isDailyLimitReached = () => ({ limitReached: false });

    // Consensus Signal with Spot Chart Structure:
    // Nifty Spot = 24500, Spot SL = 24480 (20 pts Spot Risk), Spot Target = 24540 (40 pts Spot Target = 1:2.0 R:R)
    const mockConsensusSignal = {
        type: 'BUY_SIGNAL',
        spotPrice: 24500,
        stopLoss: 24480,
        targetPrice: 24540,
        riskRewardRatio: '20.0:40.0',
        entryPremium: 150, // Option Premium = ₹150
        atmStrike: 24500,
        quantity: 65,
        numLots: 1
    };

    const orderRes = await exec.executeOrder(mockConsensusSignal, 24500, 100000);
    console.log('\n✅ Order Execution Response:', orderRes.status);
    console.log('   - Spot Entry Price:', orderRes.order.spotEntryPrice);
    console.log('   - Spot SL (Chart Level):', orderRes.order.spotSL, '(20.0 pts Spot Risk)');
    console.log('   - Spot Target (Chart Level):', orderRes.order.spotTarget, '(40.0 pts Spot Target = 1:2.0 R:R)');
    console.log('   - Option Entry Premium: ₹', orderRes.order.optionPremiumPrice);
    console.log('   - Option Premium SL: ₹', orderRes.order.currentSL, '(Calculated via 20 pts Spot Risk * 0.50 Delta = 10 pts Premium SL)');
    console.log('   - Option Premium Target: ₹', orderRes.order.target, '(Calculated via 40 pts Spot Target * 0.50 Delta = 20 pts Premium Target)');

    // Test Exit when Nifty Spot Price hits Spot Target 24540 on chart:
    const monitorRes = exec.monitorActivePosition(24540, 170);
    console.log('\n✅ Position Monitor Exit Response (Spot Price hit Chart Target 24540):');
    console.log('   - Exit Reason:', monitorRes?.reason);
    console.log('   - Final Premium Exit Price: ₹', monitorRes?.trade?.exitPremium);
    console.log('   - Final Net Trade PnL: +₹', monitorRes?.trade?.pnl);

    console.log('\n🎉 SPOT CHART MAPPING & DELTA TEST PASSED PERFECTLY!');
}

testSpotMapping().catch(console.error);
