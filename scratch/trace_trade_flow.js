const BacktestClient = require('../backtest/backtestClient');

async function traceTradeFlow() {
    console.log('===========================================================');
    console.log('🔍 TRACING TRADES FROM 2026-09-15 TO 2026-09-22');
    console.log('===========================================================');

    const client = new BacktestClient();
    await client.init();

    const report = await client.runBacktest('2026-09-15', '2026-09-22', 'NIFTY_50', '5', 1);

    console.log('\n📜 TRADES LOGGED IN JOURNAL:');
    report.trades.forEach((t, idx) => {
        console.log(`${idx + 1}. Opened: ${t.openedAt} | Closed: ${t.closedAt || 'EOD'} | Symbol: ${t.symbol} | Entry: ₹${t.entryPrice} | Exit: ₹${t.exitPrice} | PnL: ₹${t.netPnl} | Reason: ${t.reason}`);
    });
}

traceTradeFlow().catch(err => console.error(err));
