const fs = require('fs');
const path = require('path');
const backtestEngine = require('../server/backtesting/backtesting');

async function testWithMinVotes(minVotes) {
    const headFile = path.join(__dirname, '../utility/usedfull/Engines/consensus_master_head.json');
    const headData = JSON.parse(fs.readFileSync(headFile, 'utf8'));
    headData.strategies["one_to_three_strategies.json"].minVotes = minVotes;
    fs.writeFileSync(headFile, JSON.stringify(headData, null, 2));

    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const report = await backtestEngine.runBacktest({
        fromDate: "2026-09-01",
        toDate: todayStr,
        interval: "15",
        maxTradesPerDay: 3,
        targetMode: "TRAILING"
    });

    console.log(`\n====================================================`);
    console.log(`📊 SEPTEMBER 2026 BACKTEST REPORT (minVotes: ${minVotes} / 5)`);
    console.log(`====================================================`);
    console.log(`Total Trades Taken : ${report.stats.totalTrades}`);
    console.log(`Winning Trades     : ${report.stats.winningTrades}`);
    console.log(`Losing Trades      : ${report.stats.losingTrades}`);
    console.log(`Win Rate (%)       : ${report.stats.winrate}`);
    console.log(`Net Points (Nifty) : ${report.stats.netPoints} pts`);
    console.log(`Avg Points/Trade   : ${report.stats.avgTradePoints} pts`);
    console.log(`Profit Factor      : ${report.stats.profitFactor}`);
    console.log(`====================================================`);

    if (report.trades && report.trades.length > 0) {
        console.log('\n--- EXECUTED TRADES ---');
        report.trades.forEach((t, i) => {
            console.log(`Trade #${i+1} | ${t.date} ${t.time} | ${t.symbol} (${t.type}) | Entry: ${t.entryPrice} | Exit: ${t.exitPrice} | PnL: ${t.pnlPoints || t.points} pts | Reason: ${t.reason}`);
        });
    }
}

async function main() {
    console.log('Testing with minVotes = 4...');
    await testWithMinVotes(4);

    console.log('\nTesting with minVotes = 5...');
    await testWithMinVotes(5);
}

main().catch(console.error);
