/**
 * Formats Backtest Results into a clean ASCII table comparison report
 * @param {Array} reports - Array of report objects from BacktestEngine
 */
function generateComparisonReport(reports = []) {
    console.log("\n=========================================================================================");
    console.log("📊 HISTORICAL BACKTEST STRATEGY COMPARISON REPORT (DATA SOURCE: C:\\candle data)");
    console.log("=========================================================================================\n");

    const header = "| Strategy Name               | Total Trades | Win Rate % | Net PnL (₹)   | Return % | Max Drawdown % | Profit Factor |";
    const divider = "|-----------------------------|--------------|------------|---------------|----------|----------------|---------------|";

    console.log(header);
    console.log(divider);

    // Sort reports by Return % descending
    reports.sort((a, b) => b.returnPct - a.returnPct);

    reports.forEach(r => {
        const name = r.strategyName.padEnd(27, ' ');
        const trades = String(r.totalTrades).padEnd(12, ' ');
        const winRate = `${r.winRatePct}%`.padEnd(10, ' ');
        const pnl = `₹${r.netPnL}`.padEnd(13, ' ');
        const ret = `${r.returnPct}%`.padEnd(8, ' ');
        const dd = `${r.maxDrawdownPct}%`.padEnd(14, ' ');
        const pf = String(r.profitFactor).padEnd(13, ' ');

        console.log(`| ${name} | ${trades} | ${winRate} | ${pnl} | ${ret} | ${dd} | ${pf} |`);
    });

    console.log(divider);

    if (reports.length > 0) {
        const winner = reports[0];
        console.log(`\n🏆 WINNING STRATEGY: ${winner.strategyName.trim()}`);
        console.log(`   - Net Profit: ₹${winner.netPnL} (${winner.returnPct}%)`);
        console.log(`   - Win Rate: ${winner.winRatePct}% (${winner.winningTrades} Wins / ${winner.losingTrades} Losses)`);
        console.log(`   - Max Drawdown: ${winner.maxDrawdownPct}%`);
        console.log(`   - Profit Factor: ${winner.profitFactor}`);
    }

    console.log("\n=========================================================================================\n");
}

module.exports = { generateComparisonReport };
