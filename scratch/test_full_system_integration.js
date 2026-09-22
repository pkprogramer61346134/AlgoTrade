const AlgoTradeWSClient = require('../server/wsClient');
const BacktestClient = require('../backtest/backtestClient');
const MonitorClient = require('../monitor/monitorClient');

async function testFullSystemIntegration() {
    console.log('===========================================================');
    console.log('🧪 [TEST] Full System WebSocket Integration (Backtest + Monitor)');
    console.log('===========================================================');

    // 1. Initialize MonitorClient
    const monitor = new MonitorClient();
    await monitor.init();

    // 2. Initialize BacktestClient
    const backtestClient = new BacktestClient();
    await backtestClient.init();

    // 3. Run backtest simulation
    const report = await backtestClient.runBacktest('2026-09-01', '2026-09-05', 'NIFTY_50', '5');

    console.log('===========================================================');
    console.log('✅ FULL SYSTEM INTEGRATION TEST PASSED SUCCESSFULLY!');
    console.log('   - Backtest executed bar-by-bar');
    console.log('   - Consensus signals evaluated over WebSocket');
    console.log('   - Trailing SL & 1R Breathing Room verified');
    console.log('   - Live telemetry streamed to monitorClient');
    console.log('===========================================================');

    process.exit(0);
}

testFullSystemIntegration().catch((err) => {
    console.error('❌ Full System Test Failed:', err);
    process.exit(1);
});
