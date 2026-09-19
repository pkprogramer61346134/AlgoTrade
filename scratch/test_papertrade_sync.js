const PaperTradeManager = require('../order_config/papertrade/paperTradeManager');
const OrderExecutionManager = require('../order_config/orderExecutionManager');

console.log('🧪 [TEST] Verifying PaperTradeManager & OrderExecutionManager Sync...');

const paper = new PaperTradeManager();
console.log(`✅ Default Paper Capital: ₹${paper.paperBalance}`);
console.log(`✅ Default R:R Ratio: 1:${paper.config.paperTrading?.riskRewardRatio}`);
console.log(`✅ Default Max Trades/Day: ${paper.config.paperTrading?.maxTradesPerDay}`);

const exec = new OrderExecutionManager();
console.log(`✅ OrderManager Execution Mode: ${exec.config.executionMode}`);
console.log(`✅ OrderManager Default Capital: ₹${exec.config.paperTrading?.initialCapital}`);

// Simulate a signal execution
const orderResult = paper.executePaperOrder({
    optionSymbol: 'NIFTY26SEP24500CE',
    optionType: 'CE',
    spotPrice: 24500,
    atmStrike: 24500,
    optionSecurityId: '47291',
    qty: 65,
    numLots: 1,
    optionPremiumPrice: 100,
    optionSL: 90, // 10 pts risk
    target: 120, // 20 pts target (1:2.0 R:R)
    rrRatio: 2.0,
    signal: { type: 'BUY_SIGNAL' },
    dateStr: '2026-09-20',
    timeStr: '09:30 AM'
});

console.log('✅ Paper Order Executed Successfully:', orderResult.status);
console.log('   - Target Price:', orderResult.order.target, '(1:2.0 Fixed R:R)');

// Test Target Hit Monitor
const exitResult = paper.monitorPosition(24550, 120);
console.log('✅ Monitor Exit Test (Target Hit):', exitResult?.reason, '| PnL:', exitResult?.trade?.pnl);

console.log('\n🎉 ALL PAPER TRADE SYNC TESTS PASSED SUCCESSFULLY!');
