const BacktestManager = require('../order_config/backtest/backtestManager');
const stratConfig = require('../strategies_config/consensus_master_head.json');

async function compareRider() {
    console.log("=== Testing Extended Profit Rider Feature ===");

    // Test 1: Standard (Rider Disabled)
    const cfgStandard = { ...stratConfig, extendedProfitRider: { enabled: false } };
    const mgr1 = new BacktestManager(null, cfgStandard);
    const resStandard = await mgr1.runBacktest('2026-09-01', '2026-09-18', 10000);

    console.log("\n📊 STANDARD MODE (Target 1:2.0 Fixed Exit):");
    console.log(`Total Trades: ${resStandard.totalTrades} | Win Rate: ${resStandard.winRate}% | Net PnL: ₹${resStandard.netPnL} (${resStandard.netPnLPct}%) | Final Balance: ₹${resStandard.finalCapital}`);

    // Test 2: Extended Profit Rider Enabled (Target T1 Hit -> Trail SL to T1 & Extend Target to T2 1:3.5 R:R)
    const cfgRider = { ...stratConfig, extendedProfitRider: { enabled: true, extendedTargetMultiplier: 3.5 } };
    const mgr2 = new BacktestManager(null, cfgRider);
    const resRider = await mgr2.runBacktest('2026-09-01', '2026-09-18', 10000);

    console.log("\n🚀 EXTENDED PROFIT RIDER MODE (T1 Lock + T2 1:3.5 Extended Rider):");
    console.log(`Total Trades: ${resRider.totalTrades} | Win Rate: ${resRider.winRate}% | Net PnL: ₹${resRider.netPnL} (${resRider.netPnLPct}%) | Final Balance: ₹${resRider.finalCapital}`);
}

compareRider().catch(err => console.error(err));
