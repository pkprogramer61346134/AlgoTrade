/**
 * Scratch test script to run standalone backtesting with Trailing SL
 */
const backtestEngine = require('../server/backtesting/backtesting');

async function testBacktestWithTrailing() {
    console.log("=========================================");
    console.log("🧪 TESTING BACKTEST ENGINE WITH TRAILING SL");
    console.log("=========================================\n");

    try {
        const report = await backtestEngine.runBacktest({
            fromDate: "2026-09-24",
            toDate: "2026-09-28",
            interval: "5",
            maxTradesPerDay: 3
        });

        console.log("\n📊 BACKTEST REPORT STATS:");
        console.log(JSON.stringify(report.stats, null, 2));

        if (report.trades && report.trades.length > 0) {
            console.log("\n📋 RECENT TRADES SAMPLE:");
            report.trades.forEach((t, idx) => {
                console.log(`[Trade ${idx + 1}] ${t.entryDate} ${t.entryTime} -> ${t.exitTime} | Type: ${t.type} | Entry: ₹${t.entryPrice} | Exit: ₹${t.exitPrice} | Reason: ${t.exitReason} | TrailingStage: ${t.trailingStage} | Points: ${t.points}`);
            });
        }
    } catch (err) {
        console.error("❌ Backtest Test Error:", err);
    }
}

testBacktestWithTrailing();
