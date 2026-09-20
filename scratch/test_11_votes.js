const BacktestManager = require('../order_config/backtest/backtestManager');
const stratConfig = require('../strategies_config/consensus_master_head.json');

async function test11VotesWindow() {
    console.log("=== Testing Head Strategy Entry Window starting from 09:15 AM (Threshold >= 11/16 Votes) ===");
    console.log(`Config Start Time: ${stratConfig.entryStartTime} (${stratConfig.entryStartMins} mins)`);
    console.log(`Consensus Threshold: ${stratConfig.consensusThreshold}/16`);
    console.log(`Max Trades Per Day: ${stratConfig.maxTradesPerDay}`);

    const manager = new BacktestManager();
    const result = await manager.runBacktest('2026-09-01', '2026-09-18', 10000);

    console.log("\n📊 SEPTEMBER 2026 PERFORMANCE REPORT (Threshold >= 11 Votes)");
    console.log(`Total Trades: ${result.totalTrades}`);
    console.log(`Wins: ${result.wins}, Losses: ${result.losses}, Win Rate: ${result.winRate}%`);
    console.log(`Initial Capital: ₹${result.initialCapital}`);
    console.log(`Final Capital: ₹${result.finalCapital}`);
    console.log(`Net PnL: ₹${result.netPnL} (${result.netPnLPct}%)`);

    console.log("\n📋 INDIVIDUAL TRADE LIST:");
    result.trades.forEach((t, i) => {
        console.log(`Trade #${i+1}: ${t.date} ${t.entryTime} - ${t.exitTime} | Type: ${t.optionType} | Lots: ${t.numLots} | Spot: ₹${t.spotEntryPrice} -> ₹${t.spotExitPrice} | Prem: ₹${t.optionPremiumPrice} -> ₹${t.exitPremiumPrice} | PnL: ₹${t.pnlRupees} (${t.exitReason}) | Balance: ₹${t.balanceAfter}`);
    });
}

test11VotesWindow().catch(err => console.error(err));
