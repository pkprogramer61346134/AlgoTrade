const path = require('path');
const fs = require('fs');
const indicators = require('../indicators');
const BacktestEngine = require('./engine/backtestEngine');

const DATA_DIR = "C:\\candle data";

function runFullDataset10kSimulation() {
    console.log("=========================================================================================");
    console.log("🚀 FULL DATASET (2018-2026) DAILY TRADE TEST WITH ₹10,000 INITIAL CAPITAL");
    console.log("=========================================================================================\n");

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
    let allCandles = [];

    for (const f of files) {
        try {
            const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) allCandles = allCandles.concat(parsed);
        } catch (e) {}
    }

    allCandles.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const totalCandles = allCandles.length;
    const uniqueDates = [...new Set(allCandles.map(c => c.date))];

    console.log(`✅ Loaded ${totalCandles} candles across ${uniqueDates.length} trading days!`);
    console.log(`📅 Date Range: ${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}\n`);

    const ema200 = indicators.trend.calculateEMA(allCandles, 200);
    const rvol = indicators.volume.calculateRelativeVolume(allCandles, 20);
    const rsi = indicators.momentum.calculateRSI(allCandles, 14);

    // Precalculate Day ORB
    const dayORB = {};
    for (let i = 0; i < allCandles.length; i++) {
        const c = allCandles[i];
        if (!c.date) continue;
        if (!dayORB[c.date]) dayORB[c.date] = { high: -Infinity, low: Infinity, count: 0 };
        if (dayORB[c.date].count < 3) {
            if (c.high > dayORB[c.date].high) dayORB[c.date].high = c.high;
            if (c.low < dayORB[c.date].low) dayORB[c.date].low = c.low;
            dayORB[c.date].count++;
        }
    }

    // Run Backtest Engine starting at ₹10,000 Capital
    const engine = new BacktestEngine(10000, 2.0); // 2% Risk per trade
    const dailyTradeCount = {};
    const yearlyStats = {};

    for (let i = 0; i < allCandles.length; i++) {
        const c = allCandles[i];
        if (!c.date) continue;

        engine.checkPositionExit(c);

        if ((dailyTradeCount[c.date] || 0) < 3 && !engine.activePosition) {
            const orb = dayORB[c.date];
            if (orb && orb.high !== -Infinity && orb.count >= 3) {
                const r = rvol[i] || 1.0;
                const e200 = ema200[i];
                const rsiVal = rsi[i] || 50;

                if (e200 && r >= 2.0) {
                    if (c.close > orb.high && c.close > e200 && rsiVal > 50) {
                        const sl = orb.low;
                        const risk = c.close - sl;
                        if (risk > 0) {
                            const tp = Number((c.close + (1.5 * risk)).toFixed(2));
                            engine.executeTrade({ type: "BUY", entryPrice: c.close, stopLoss: sl, targetPrice: tp }, c);
                            dailyTradeCount[c.date] = (dailyTradeCount[c.date] || 0) + 1;
                        }
                    } else if (c.close < orb.low && c.close < e200 && rsiVal < 50) {
                        const sl = orb.high;
                        const risk = sl - c.close;
                        if (risk > 0) {
                            const tp = Number((c.close - (1.5 * risk)).toFixed(2));
                            engine.executeTrade({ type: "SELL", entryPrice: c.close, stopLoss: sl, targetPrice: tp }, c);
                            dailyTradeCount[c.date] = (dailyTradeCount[c.date] || 0) + 1;
                        }
                    }
                }
            }
        }
    }

    const report = engine.getReport("Full Dataset Daily Trades");

    // Group stats by Year
    report.trades.forEach(t => {
        const year = t.entryDate.split('-')[0];
        if (!yearlyStats[year]) {
            yearlyStats[year] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
        }
        yearlyStats[year].trades++;
        if (t.isWin) yearlyStats[year].wins++;
        else yearlyStats[year].losses++;
        yearlyStats[year].pnl += t.pnl;
    });

    console.log("=========================================================================================");
    console.log("📊 YEAR-BY-YEAR PERFORMANCE BREAKDOWN (STARTING CAPITAL: ₹10,000)");
    console.log("=========================================================================================");
    console.log("| Year | Total Trades | Wins | Losses | Win Rate % | Net Profit / Loss (₹) |");
    console.log("|------|--------------|------|--------|------------|-----------------------|");

    Object.keys(yearlyStats).sort().forEach(yr => {
        const s = yearlyStats[yr];
        const wr = ((s.wins / s.trades) * 100).toFixed(2);
        const pnlStr = (s.pnl >= 0 ? `+₹${s.pnl.toFixed(2)}` : `₹${s.pnl.toFixed(2)}`).padEnd(21, ' ');

        console.log(`| ${yr.padEnd(4)} | ${String(s.trades).padEnd(12)} | ${String(s.wins).padEnd(4)} | ${String(s.losses).padEnd(6)} | ${String(wr + '%').padEnd(10)} | ${pnlStr} |`);
    });

    console.log("=========================================================================================");
    console.log(`\n🏆 OVERALL ALL-TIME DATASET PERFORMANCE SUMMARY:`);
    console.log("=========================================================================================");
    console.log(`- Starting Capital:     ₹10,000`);
    console.log(`- Final Account Balance: ₹${report.finalCapital}`);
    console.log(`- Total Net Profit:     +₹${report.netPnL} (+${report.returnPct}% Total Growth)`);
    console.log(`- Total Trading Days:   ${uniqueDates.length} Days`);
    console.log(`- Total Trades Taken:   ${report.totalTrades} Trades`);
    console.log(`- Total Wins:           ${report.winningTrades} Wins`);
    console.log(`- Total Losses:         ${report.losingTrades} Losses`);
    console.log(`- Win Rate:             ${report.winRatePct}% 🎯`);
    console.log(`- Max Drawdown (Risk):  ${report.maxDrawdownPct}% 🛡️`);
    console.log(`- Profit Factor:        ${report.profitFactor}`);
    console.log("=========================================================================================\n");
}

if (require.main === module) {
    runFullDataset10kSimulation();
}

module.exports = { runFullDataset10kSimulation };
