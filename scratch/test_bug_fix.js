const engine = require('../server/backtesting/backtesting.js');

async function testBugFix() {
    console.log("==========================================================================");
    console.log("🧪 VERIFYING SL=5 AND TARGET=20 BUG FIX ON BACKTEST ENGINE");
    console.log("==========================================================================\n");

    const report = await engine.runBacktest({
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
        interval: "15",
        slPoints: 5,
        targetPoints: 20,
        maxTradesPerDay: 3
    });

    console.log(`\n✅ Total Trades: ${report.stats.totalTrades}`);
    console.log(`✅ Winrate: ${report.stats.winrate}`);
    console.log(`✅ Net Points: ${report.stats.netPoints}`);

    console.log("\n📋 FIRST 5 TRADES AUDIT:");
    report.trades.slice(0, 5).forEach(t => {
        const slDiff = Math.abs(t.entryPrice - t.initialSl);
        const trDiff = Math.abs(t.entryPrice - t.targetPrice);
        console.log(`  - ${t.tradeId} | ${t.type} | Entry: ${t.entryPrice} | SL: ${t.initialSl} (Diff: ${slDiff.toFixed(2)} pts) | Target: ${t.targetPrice} (Diff: ${trDiff.toFixed(2)} pts) | Result: ${t.result} (${t.points} pts)`);
    });
}

testBugFix().catch(console.error);
