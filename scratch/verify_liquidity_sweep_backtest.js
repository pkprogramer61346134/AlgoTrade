const engine = require('../server/backtesting/backtesting.js');

const testMonths = [
    { name: "May 2026", from: "2026-05-01", to: "2026-05-31" },
    { name: "June 2026", from: "2026-06-01", to: "2026-06-30" },
    { name: "July 2026", from: "2026-07-01", to: "2026-07-31" },
    { name: "August 2026", from: "2026-08-01", to: "2026-08-31" },
    { name: "September 2026", from: "2026-09-01", to: "2026-09-30" }
];

async function verifyPatternStrategy() {
    console.log("==========================================================================");
    console.log("🎯 VERIFYING INSTITUTIONAL LIQUIDITY SWEEP PATTERN ON REAL BACKTEST ENGINE");
    console.log("==========================================================================\n");

    let grandTotalTrades = 0;
    let grandTotalWins = 0;
    let grandTotalLosses = 0;
    let grandTotalPts = 0;

    for (const m of testMonths) {
        const res = await engine.runBacktest({
            fromDate: m.from,
            toDate: m.to,
            interval: "15",
            slPoints: 30,
            targetPoints: 60,
            maxTradesPerDay: 1
        });

        const s = res.stats || {};
        grandTotalTrades += s.totalTrades || 0;
        grandTotalWins += s.winningTrades || 0;
        grandTotalLosses += s.losingTrades || 0;
        grandTotalPts += s.netPoints || 0;

        const icon = (s.netPoints || 0) >= 0 ? "🟢 GREEN" : "🔴 RED";
        console.log(`🗓️ ${m.name.padEnd(14)} | Trades: ${String(s.totalTrades).padStart(2)} | Wins: ${String(s.winningTrades).padStart(2)} | Winrate: ${(s.winrate || "0%").padStart(5)} | Net Pts: +${(s.netPoints || 0).toFixed(2)} pts (${icon})`);
    }

    const overallWinrate = grandTotalTrades > 0 ? (grandTotalWins / grandTotalTrades * 100).toFixed(1) : "0.0";

    console.log("\n==========================================================================");
    console.log("🏆 GRAND TOTAL PERFORMANCE REPORT:");
    console.log("==========================================================================");
    console.log(`Total Trades: ${grandTotalTrades}`);
    console.log(`PASS Wins: ${grandTotalWins} 🟢 | LOSS Fails: ${grandTotalLosses} 🔴`);
    console.log(`Overall Pattern Win Rate: 🎯 ${overallWinrate}%`);
    console.log(`Overall Net Points Gain: 🟢 +${grandTotalPts.toFixed(2)} pts`);
    console.log("==========================================================================\n");
}

verifyPatternStrategy().catch(console.error);
