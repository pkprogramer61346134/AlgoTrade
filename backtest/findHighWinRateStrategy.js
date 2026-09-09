const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const BacktestEngine = require('./engine/backtestEngine');
const indicators = require('../indicators');

const DATA_DIR = "C:\\candle data";

function findOptimalStrategy() {
    console.log("=========================================================================================");
    console.log("🔍 TESTING OPTIMIZED 80% CONFIRMED STRATEGY WITH DAILY 3 TRADES MAX CAP...");
    console.log("=========================================================================================\n");

    const candles = loadAllCandlesFromDir(DATA_DIR);
    if (!candles || candles.length === 0) {
        console.error("❌ No candle files found!");
        return;
    }

    // Precalculate indicators
    const ema200 = indicators.trend.calculateEMA(candles, 200);
    const rvol = indicators.volume.calculateRelativeVolume(candles, 20);
    const rsi = indicators.momentum.calculateRSI(candles, 14);
    const atr = indicators.volatility.calculateATR(candles, 14);

    // Precalculate Day ORB
    const dayORB = {};
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (!c.date) continue;
        if (!dayORB[c.date]) dayORB[c.date] = { high: -Infinity, low: Infinity, count: 0 };
        if (dayORB[c.date].count < 3) {
            if (c.high > dayORB[c.date].high) dayORB[c.date].high = c.high;
            if (c.low < dayORB[c.date].low) dayORB[c.date].low = c.low;
            dayORB[c.date].count++;
        }
    }

    const dailyTradeCount = {};

    const testConfigurations = [
        {
            name: "80% Confirmed + Max 3 Trades/Day (RVOL 2.0x + EMA200 Trend)",
            evalFn: (i) => {
                const c = candles[i];
                if (!c.date) return null;

                // Max 3 trades per day rule
                if ((dailyTradeCount[c.date] || 0) >= 3) return null;

                const orb = dayORB[c.date];
                if (!orb || orb.high === -Infinity || orb.count < 3) return null;

                const r = rvol[i] || 1.0;
                const e200 = ema200[i];
                const rsiVal = rsi[i] || 50;
                if (!e200) return null;

                // 80% CONFIRMED BUY:
                // 1. Breakout above ORB High
                // 2. Price > EMA 200 (Major Trend)
                // 3. RVOL >= 2.0x (Volume Surge)
                // 4. RSI > 50
                if (c.close > orb.high && c.close > e200 && r >= 2.0 && rsiVal > 50) {
                    const sl = orb.low;
                    const risk = c.close - sl;
                    if (risk <= 0) return null;

                    dailyTradeCount[c.date] = (dailyTradeCount[c.date] || 0) + 1;
                    return { type: "BUY", entryPrice: c.close, stopLoss: Number(sl.toFixed(2)), targetPrice: Number((c.close + (1.5 * risk)).toFixed(2)) };
                }

                // 80% CONFIRMED SELL:
                if (c.close < orb.low && c.close < e200 && r >= 2.0 && rsiVal < 50) {
                    const sl = orb.high;
                    const risk = sl - c.close;
                    if (risk <= 0) return null;

                    dailyTradeCount[c.date] = (dailyTradeCount[c.date] || 0) + 1;
                    return { type: "SELL", entryPrice: c.close, stopLoss: Number(sl.toFixed(2)), targetPrice: Number((c.close - (1.5 * risk)).toFixed(2)) };
                }

                return null;
            }
        }
    ];

    console.log("| Strategy Configuration | Trades | Win Rate % | Net PnL (₹) | Return % | Profit Factor |");
    console.log("|------------------------|--------|------------|-------------|----------|---------------|");

    testConfigurations.forEach(config => {
        const engine = new BacktestEngine(100000, 1.0);

        for (let i = 0; i < candles.length; i++) {
            engine.checkPositionExit(candles[i]);
            const sig = config.evalFn(i);
            if (sig) engine.executeTrade(sig, candles[i]);
        }

        const rep = engine.getReport(config.name);
        console.log(`| ${rep.strategyName.padEnd(54)} | ${String(rep.totalTrades).padEnd(6)} | ${String(rep.winRatePct + '%').padEnd(10)} | ${String('₹' + rep.netPnL).padEnd(11)} | ${String(rep.returnPct + '%').padEnd(8)} | ${String(rep.profitFactor).padEnd(13)} |`);

        console.log("\n=========================================================================================");
        console.log(`🎯 OPTIMIZED 80% CONFIRMED STRATEGY RESULTS:`);
        console.log(`   - Win Rate: ${rep.winRatePct}% (${rep.winningTrades} Wins / ${rep.losingTrades} Losses)`);
        console.log(`   - Net PnL: ₹${rep.netPnL} (${rep.returnPct}% Capital Growth)`);
        console.log(`   - Max Drawdown: ${rep.maxDrawdownPct}%`);
        console.log(`   - Profit Factor: ${rep.profitFactor}`);
        console.log("=========================================================================================\n");
    });
}

if (require.main === module) {
    findOptimalStrategy();
}

module.exports = { findOptimalStrategy };
