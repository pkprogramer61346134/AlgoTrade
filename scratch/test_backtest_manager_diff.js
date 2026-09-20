const BacktestManager = require('../order_config/backtest/backtestManager');

async function testDiff() {
    const mgr = new BacktestManager();
    console.log("MGR STRAT CONFIG:", mgr.stratConfig);
    const res = await mgr.runBacktest('2026-09-01', '2026-09-18', 10000);
    console.log("MGR RES TRADES COUNT:", res.totalTrades);
    res.trades.forEach(t => console.log(t.date, t.entryTime, t.optionType, t.pnlRupees));
}

testDiff();
