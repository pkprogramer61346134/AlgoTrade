const BacktestManager = require('../order_config/backtest/backtestManager');

async function runThreshold13FullBacktest() {
    console.log("===================================================================================");
    console.log("📊 [ACTIVE CONFIG BACKTEST] Consensus Threshold 13/16 (Up to 3 Trades/Day)");
    console.log("===================================================================================\n");

    const manager = new BacktestManager();
    const months = [
        { name: "January 2026", start: "2026-01-01", end: "2026-01-31" },
        { name: "February 2026", start: "2026-02-01", end: "2026-02-28" },
        { name: "March 2026", start: "2026-03-01", end: "2026-03-31" },
        { name: "April 2026", start: "2026-04-01", end: "2026-04-30" },
        { name: "May 2026", start: "2026-05-01", end: "2026-05-31" },
        { name: "June 2026", start: "2026-06-01", end: "2026-06-30" },
        { name: "July 2026", start: "2026-07-01", end: "2026-07-31" },
        { name: "August 2026", start: "2026-08-01", end: "2026-08-31" },
        { name: "September 2026", start: "2026-09-01", end: "2026-09-18" }
    ];

    let currentCap = 10000;
    let grandTrades = 0;
    let grandWins = 0;
    let grandLosses = 0;

    console.log("Month              | Trades | Wins / Losses | Win Rate | Monthly PnL (₹) | Ending Account Balance");
    console.log("--------------------------------------------------------------------------------------------------");

    for (const m of months) {
        const res = await manager.runBacktest(m.start, m.end, currentCap);
        const pnlStr = (res.netPnL >= 0 ? '+' : '') + `₹${res.netPnL.toLocaleString()}`;
        console.log(`${m.name.padEnd(18)} | ${String(res.totalTrades).padStart(6)} | ${String(res.wins).padStart(2)}W / ${String(res.losses).padStart(2)}L   | ${String(res.winRate).padStart(7)}% | ${pnlStr.padStart(15)} | ₹${res.finalCapital.toLocaleString()}`);

        currentCap = res.finalCapital;
        grandTrades += res.totalTrades;
        grandWins += res.wins;
        grandLosses += res.losses;
    }

    console.log("--------------------------------------------------------------------------------------------------");
    console.log(`🏆 FINAL CUMULATIVE RESULT:`);
    console.log(`  Starting Capital     : ₹10,000`);
    console.log(`  Ending Account Cap   : ₹${currentCap.toLocaleString()} 🚀`);
    console.log(`  Net Realized Profit  : +₹${(currentCap - 10000).toLocaleString()}`);
    console.log(`  Total Trades (9 Mths): ${grandTrades} Trades (~${(grandTrades / 8.6).toFixed(1)} Trades/Month)`);
    console.log("===================================================================================");
}

runThreshold13FullBacktest().catch(console.error);
