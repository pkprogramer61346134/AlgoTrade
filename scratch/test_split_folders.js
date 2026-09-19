const path = require('path');
const fs = require('fs');
const BacktestExecutionEngine = require('../order_config/backtest/backtestExecutionEngine');

const engine = new BacktestExecutionEngine();

const candles = [];
let price = 24500;
for (let i = 0; i < 75; i++) {
    const hh = String(9 + Math.floor((15 + i * 5) / 60)).padStart(2, '0');
    const mm = String((15 + i * 5) % 60).padStart(2, '0');
    price += (i < 20 ? 8 : (i < 40 ? -7 : 10));
    const open = Number((price - 3).toFixed(2));
    const close = Number(price.toFixed(2));
    const high = Number((price + 8).toFixed(2));
    const low = Number((price - 8).toFixed(2));

    candles.push({
        date: '2026-09-01',
        time: `${hh}:${mm}`,
        open, high, low, close, volume: 30000
    });
}

const mockStrategy = {
    id: "consensus_master_head",
    name: "👑 Master Head Multi-Strategy Consensus Engine (16-Engine Voting)",
    consensusThreshold: 3,
    riskRewardRatio: 3.0
};

const result = engine.runBacktest(candles, mockStrategy, 10000, 100, 65);

console.log("\n📊 Backtest Result Summary (Dhan TV Replay Mode):");
console.log(` - Strategy Name: ${result.strategyName}`);
console.log(` - Initial Capital: ₹${result.initialCapital}`);
console.log(` - Final Capital: ₹${result.finalCapital}`);
console.log(` - Net PnL: ₹${result.netPnL} (${result.returnPct}%)`);
console.log(` - Total Trades: ${result.totalTrades}`);

if (result.trades.length > 0) {
    console.log("\n📋 Trade Table (Direct Index Spot Points - No Strike Price):");
    console.table(result.trades.map(t => ({
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
