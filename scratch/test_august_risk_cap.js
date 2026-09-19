const path = require('path');
const fs = require('fs');
const BacktestExecutionEngine = require('../order_config/backtest/backtestExecutionEngine');

const engine = new BacktestExecutionEngine();
const candleDir = 'C:\\candle data';
let augustCandles = [];

if (fs.existsSync(candleDir)) {
    const files = fs.readdirSync(candleDir).filter(f => f.startsWith('nifty_5min_dhan_2026-08')).sort();
    console.log(`📁 Found ${files.length} August 2026 candle files`);
    for (const f of files) {
        try {
            const content = JSON.parse(fs.readFileSync(path.join(candleDir, f), 'utf-8'));
            if (Array.isArray(content)) {
                augustCandles.push(...content);
            }
        } catch (e) {}
    }
}

const masterStrategy = {
    id: "consensus_master_head",
    name: "👑 Master Head Multi-Strategy Consensus Engine (16-Engine Voting)",
    riskRewardRatio: 3.0
};

console.log(`🕯️ Total August candles loaded: ${augustCandles.length}`);
const result = engine.runBacktest(augustCandles, masterStrategy, 10000, 100, 65);

console.log("\n==========================================================================");
console.log("📊 AUGUST 2026 BACKTEST REPORT (RISK-MANAGED LOT SIZING)");
console.log("==========================================================================");
console.log(` - Strategy Name: ${result.strategyName}`);
console.log(` - Initial Capital: ₹${result.initialCapital}`);
console.log(` - Final Capital: ₹${result.finalCapital.toFixed(2)}`);
console.log(` - Net PnL: ₹${result.netPnL.toLocaleString()} (${result.returnPct}%)`);
console.log(` - Total Trades: ${result.totalTrades}`);
console.log(` - Winning Trades: ${result.winningTrades} | Losing Trades: ${result.losingTrades}`);
console.log(` - Win Rate: ${result.winRate}%`);
console.log(` - Max Drawdown: ${result.maxDrawdownPct}%`);
console.log("==========================================================================\n");

if (result.trades.length > 0) {
    console.table(result.trades.slice(0, 10).map(t => ({
        date: t.date,
        entryTime: t.entryTime,
        exitTime: t.exitTime,
        type: t.type,
        spotEntry: t.spotEntryPrice,
        spotExit: t.spotExitPrice,
        qty: t.quantity,
        pointsPnL: t.pointsPnL,
        pnlRupees: t.pnl,
        balanceAfter: t.balanceAfter,
        result: t.result
    })));
}
