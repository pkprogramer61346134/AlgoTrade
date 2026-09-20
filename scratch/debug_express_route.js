const path = require('path');
const fs = require('fs');
const BacktestManager = require('../order_config/backtest/backtestManager');

async function testExpressRouteLogic() {
    const start = '2026-09-01';
    const end = '2026-09-18';
    const capital = 10000;

    console.log(`Testing BacktestManager directly:`);
    const freshManager = new BacktestManager();
    console.log("Strat config consensusThreshold:", freshManager.stratConfig.consensusThreshold);
    const report = await freshManager.runBacktest(start, end, capital);
    console.log("Report trades count:", report.totalTrades);
    console.log("Report trades:", report.trades.map(t => `${t.date} ${t.entryTime} ${t.optionType} PnL: ${t.pnlRupees}`));
}

testExpressRouteLogic();
