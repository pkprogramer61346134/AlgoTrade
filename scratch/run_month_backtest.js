const backtestEngine = require('../server/backtesting/backtesting');

async function main() {
    console.log('🚀 Starting September 2026 Month Backtest...');

    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const report = await backtestEngine.runBacktest({
        fromDate: "2026-09-01",
        toDate: todayStr,
        interval: "15",
        maxTradesPerDay: 3,
        targetMode: "TRAILING"
    });

    console.log('\n====================================================');
    console.log('📊 SEPTEMBER 2026 BACKTEST PERFORMANCE SUMMARY');
    console.log('====================================================');

    const stats = report.stats;
    console.log(`Period                  : ${report.fromDate} to ${report.toDate}`);
    console.log(`Total Candles Evaluated : ${report.totalCandles}`);
    console.log(`Total Trades Taken      : ${stats.totalTrades}`);
    console.log(`Winning Trades (Wins)   : ${stats.winningTrades}`);
    console.log(`Losing Trades (Losses)  : ${stats.losingTrades}`);
    console.log(`Win Rate (%)            : ${stats.winrate}`);
    console.log(`Net Points (Nifty)      : ${stats.netPoints} pts`);
    console.log(`Avg Points / Trade      : ${stats.avgTradePoints} pts`);
    console.log(`Profit Factor           : ${stats.profitFactor}`);
    console.log('====================================================\n');

    console.log('--- TRADE LOGS SUMMARY ---');
    if (report.trades && report.trades.length > 0) {
        report.trades.forEach((t, i) => {
            console.log(`[Trade ${i + 1}] ${t.date} ${t.time} | ${t.symbol} (${t.type}) | Entry: ${t.entryPrice} | Exit: ${t.exitPrice} | Reason: ${t.reason} | PnL Points: ${t.pnlPoints || t.points}`);
        });
    } else {
        console.log('No trades executed during this backtest period.');
    }
}

main().catch(console.error);
