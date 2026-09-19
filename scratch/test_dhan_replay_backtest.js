const path = require('path');
const fs = require('fs');
const BacktestExecutionEngine = require('../order_config/backtest/backtestExecutionEngine');

const engine = new BacktestExecutionEngine();
const candleDir = 'C:\\candle data';
let allCandles = [];

if (fs.existsSync(candleDir)) {
    const files = fs.readdirSync(candleDir).filter(f => f.startsWith('nifty_5min_dhan_')).sort();
    console.log(`📁 Loading all ${files.length} Dhan 5-minute candle files...`);

    for (const f of files) {
        try {
            const content = JSON.parse(fs.readFileSync(path.join(candleDir, f), 'utf-8'));
            if (Array.isArray(content)) {
                allCandles.push(...content);
            }
        } catch (e) {}
    }
}

const stratPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
const masterStrategy = JSON.parse(fs.readFileSync(stratPath, 'utf-8'));

console.log(`🕯️ Total 5-min candles loaded: ${allCandles.length}`);
const result = engine.runBacktest(allCandles, masterStrategy, 10000, 100, 65);

console.log("\n==========================================================================");
console.log("📊 FULL 7-MONTH DHAN TV REPLAY SPOT INDEX POINTS BACKTEST REPORT");
console.log("==========================================================================");
console.log(` - Strategy Name: ${result.strategyName}`);
console.log(` - Initial Capital: ₹${result.initialCapital}`);
console.log(` - Final Capital: ₹${result.finalCapital.toFixed(2)}`);
console.log(` - Net PnL: ₹${result.netPnL.toLocaleString()} (${result.returnPct}%)`);
console.log(` - Total Trades: ${result.totalTrades}`);
console.log(` - Winning Trades: ${result.winningTrades} | Losing Trades: ${result.losingTrades}`);
console.log(` - Win Rate: ${result.winRate}%`);
console.log(` - Profit Factor: ${result.profitFactor}`);
console.log(` - Max Drawdown: ${result.maxDrawdownPct}%`);
console.log("==========================================================================\n");

if (result.trades.length > 0) {
    console.log("📋 First 10 Trades (Direct Spot Index Points Mode):");
    console.table(result.trades.slice(0, 10).map(t => ({
        date: t.date,
        entryTime: t.entryTime,
        exitTime: t.exitTime,
        type: t.type,
        symbol: t.symbol,
        spotEntry: t.spotEntryPrice,
        spotExit: t.spotExitPrice,
        qty: t.quantity,
        pointsPnL: t.pointsPnL,
        pnlRupees: t.pnl,
        balanceAfter: t.balanceAfter,
        result: t.result
    })));
}
