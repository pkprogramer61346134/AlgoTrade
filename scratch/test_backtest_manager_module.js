const BacktestManager = require('../order_config/backtest/backtestManager');

async function test() {
    const manager = new BacktestManager();
    const res = await manager.runBacktest('2026-09-01', '2026-09-18', 100000);
    console.log("Backtest Manager Module Result:", {
        startDate: res.startDate,
        endDate: res.endDate,
        initialCapital: res.initialCapital,
        finalCapital: res.finalCapital,
        netPnL: res.netPnL,
        netPnLPct: res.netPnLPct,
        totalTrades: res.totalTrades,
        winRate: res.winRate
    });
}

test().catch(console.error);
