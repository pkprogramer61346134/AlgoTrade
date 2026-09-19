const OrderExecutionManager = require('../order_config/orderExecutionManager');
const { candleDataHub } = require('../src/candleDataHub');
const fs = require('fs');

(async () => {
    const masterHeadConfig = JSON.parse(fs.readFileSync('./strategies_config/consensus_master_head.json', 'utf8'));
    const orderMgr = new OrderExecutionManager();

    console.log('===================================================================================');
    console.log('📊 MASTER HEAD CONSENSUS ENGINE: STANDALONE MONTH-BY-MONTH P&L REPORT (100K CAPITAL)');
    console.log('===================================================================================\n');

    const months = [
        { name: 'January 2026', start: '2026-01-01', end: '2026-01-31' },
        { name: 'February 2026', start: '2026-02-01', end: '2026-02-28' },
        { name: 'March 2026', start: '2026-03-01', end: '2026-03-31' },
        { name: 'April 2026', start: '2026-04-01', end: '2026-04-30' },
        { name: 'May 2026', start: '2026-05-01', end: '2026-05-31' },
        { name: 'June 2026', start: '2026-06-01', end: '2026-06-30' },
        { name: 'July 2026', start: '2026-07-01', end: '2026-07-31' },
        { name: 'August 2026', start: '2026-08-01', end: '2026-08-31' },
        { name: 'September 2026', start: '2026-09-01', end: '2026-09-18' }
    ];

    let totalCumulativePnL = 0;
    let totalCumulativeTrades = 0;
    let totalWins = 0;
    let totalLosses = 0;

    const summaryTable = [];

    for (const m of months) {
        const candles = await candleDataHub.getCandlesWithWarmup(m.start, m.end, 300);
        // Filter candles strictly for the month's date range for PnL calculation
        const monthCandles = candles.filter(c => c.date >= m.start && c.date <= m.end);
        
        const result = orderMgr.runBacktest(candles, masterHeadConfig, 100000);
        
        // Filter result trades strictly within requested month
        const monthTrades = result.trades.filter(t => t.date >= m.start && t.date <= m.end);
        const monthPnL = monthTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const monthWins = monthTrades.filter(t => t.pnl > 0).length;
        const monthLosses = monthTrades.filter(t => t.pnl <= 0).length;
        const monthWinRate = monthTrades.length > 0 ? ((monthWins / monthTrades.length) * 100).toFixed(2) : 0;
        const monthReturnPct = ((monthPnL / 100000) * 100).toFixed(2);

        totalCumulativePnL += monthPnL;
        totalCumulativeTrades += monthTrades.length;
        totalWins += monthWins;
        totalLosses += monthLosses;

        summaryTable.push({
            Month: m.name,
            DateRange: `${m.start} to ${m.end}`,
            Trades: monthTrades.length,
            WinRate: `${monthWinRate}%`,
            NetPnL: `${monthPnL >= 0 ? '+' : ''}₹${monthPnL.toLocaleString()}`,
            ReturnPct: `${monthReturnPct >= 0 ? '+' : ''}${monthReturnPct}%`,
            Wins: monthWins,
            Losses: monthLosses
        });
    }

    console.table(summaryTable);

    const overallWinRate = totalCumulativeTrades > 0 ? ((totalWins / totalCumulativeTrades) * 100).toFixed(2) : 0;
    const overallReturn = ((totalCumulativePnL / 100000) * 100).toFixed(2);

    console.log('\n===================================================================================');
    console.log('🏆 2026 FULL YEAR STANDALONE MONTH-BY-MONTH SUMMARY');
    console.log('===================================================================================');
    console.log(`  Base Capital Per Month   : ₹100,000`);
    console.log(`  Total Net PnL Across 2026: ${totalCumulativePnL >= 0 ? '+' : ''}₹${totalCumulativePnL.toLocaleString()} (${overallReturn}%)`);
    console.log(`  Total Trades Executed    : ${totalCumulativeTrades} Trades`);
    console.log(`  Overall Win Rate         : ${overallWinRate}% (${totalWins} Wins / ${totalLosses} Losses)`);
    console.log('===================================================================================\n');
})();
