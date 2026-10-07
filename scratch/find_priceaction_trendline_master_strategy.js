const fs = require('fs');
const path = require('path');
const { detectCandlestickPatterns } = require('../utility/usedfull/Engines/tools/indicators/price_action/candlestick_patterns');
const { detectTrendlineBreakout } = require('../utility/usedfull/Engines/tools/indicators/price_action/trendline');
const { calculateVWAP } = require('../utility/usedfull/Engines/tools/indicators/trend/vwap');

const cacheDir = path.join(__dirname, '../candle_data');

async function runStrategySweep() {
    console.log("==========================================================================");
    console.log("🔍 [ADVANCED COMBINED STRATEGY SWEEP] Price Action + Candlestick + Trendline + Trend Filter");
    console.log("==========================================================================\n");

    const files = fs.readdirSync(cacheDir).filter(f => f.includes('15m') && f.endsWith('.json'));
    let allCandles = [];
    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf-8'));
            if (Array.isArray(data)) allCandles = allCandles.concat(data);
        } catch (e) {}
    }
    allCandles.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    const vwapArr = calculateVWAP(allCandles);

    const comboStrategies = [
        {
            id: "TRENDLINE_VWAP_CANDLESTICK",
            name: "🔥 Trendline Breakout + VWAP Filter + Candlestick Pattern",
            eval: (slice, i) => {
                const tl = detectTrendlineBreakout(slice);
                const cp = detectCandlestickPatterns(slice);
                const close = slice[slice.length - 1].close;
                const vwap = vwapArr[i];

                const hasBullishPattern = cp.some(p => p.type === "BULLISH");
                const hasBearishPattern = cp.some(p => p.type === "BEARISH");

                const buy = (tl.bullishBreakout || hasBullishPattern) && (vwap !== null && close > vwap);
                const sell = (tl.bearishBreakout || hasBearishPattern) && (vwap !== null && close < vwap);
                return { buy, sell };
            }
        },
        {
            id: "TRENDLINE_HAMMER_SHOOTINGSTAR",
            name: "🕯️ Trendline Breakout OR Hammer (Buy) / Shooting Star (Sell)",
            eval: (slice, i) => {
                const tl = detectTrendlineBreakout(slice);
                const cp = detectCandlestickPatterns(slice);
                const hasHammer = cp.some(p => p.name === "HAMMER");
                const hasStar = cp.some(p => p.name === "SHOOTING_STAR");

                const buy = tl.bullishBreakout || hasHammer;
                const sell = tl.bearishBreakout || hasStar;
                return { buy, sell };
            }
        },
        {
            id: "TRENDLINE_CANDLE_FILTER",
            name: "🛡️ Trendline Breakout WITH Candlestick Confirmation Only",
            eval: (slice, i) => {
                const tl = detectTrendlineBreakout(slice);
                const cp = detectCandlestickPatterns(slice);
                const buy = tl.bullishBreakout && cp.some(p => p.type === "BULLISH" || p.name === "HAMMER");
                const sell = tl.bearishBreakout && cp.some(p => p.type === "BEARISH" || p.name === "SHOOTING_STAR");
                return { buy, sell };
            }
        }
    ];

    const targetOpts = [30, 50, 70];
    const slOpts = [15, 25, 35];
    let best = null;

    for (const strat of comboStrategies) {
        for (const tp of targetOpts) {
            for (const sl of slOpts) {
                let activePos = null;
                let trades = [];
                let dailyTrades = {};

                for (let i = 10; i < allCandles.length; i++) {
                    const tick = allCandles[i];
                    const candleClose = Number(tick.close || tick.candleClose || 0);
                    const candleHigh = Number(tick.high || tick.candleHigh || candleClose);
                    const candleLow = Number(tick.low || tick.candleLow || candleClose);

                    if (activePos) {
                        const isBUY = activePos.type === "BUY";
                        let isTarget = isBUY ? candleHigh >= activePos.target : candleLow <= activePos.target;
                        let isSL = isBUY ? candleLow <= activePos.sl : candleHigh >= activePos.sl;
                        let isEOD = i === allCandles.length - 1 || allCandles[i+1].date !== tick.date;

                        if (isTarget || isSL || isEOD) {
                            const exitPrice = isTarget ? activePos.target : (isSL ? activePos.sl : candleClose);
                            const pts = isBUY ? (exitPrice - activePos.entry) : (activePos.entry - exitPrice);
                            trades.push({ result: pts >= 0 ? "PASS" : "LOSS", points: pts });
                            activePos = null;
                        }
                    }

                    const dayKey = tick.date;
                    const dayCount = dailyTrades[dayKey] || 0;

                    if (!activePos && dayCount < 3) {
                        const slice = allCandles.slice(0, i + 1);
                        const { buy, sell } = strat.eval(slice, i);

                        if (buy || sell) {
                            dailyTrades[dayKey] = dayCount + 1;
                            const type = buy ? "BUY" : "SELL";
                            const entry = candleClose;
                            const target = type === "BUY" ? entry + tp : entry - tp;
                            const slPrice = type === "BUY" ? entry - sl : entry + sl;
                            activePos = { type, entry, target, sl: slPrice };
                        }
                    }
                }

                const total = trades.length;
                const wins = trades.filter(t => t.result === "PASS").length;
                const winrate = total > 0 ? (wins / total * 100).toFixed(1) : "0.0";
                const netPts = trades.reduce((sum, t) => sum + t.points, 0);

                const res = {
                    name: strat.name,
                    id: strat.id,
                    target: tp,
                    sl,
                    total,
                    wins,
                    winrate: `${winrate}%`,
                    netPts: Number(netPts.toFixed(2))
                };

                if (!best || res.netPts > best.netPts) best = res;

                console.log(`[COMBO] ${strat.name.padEnd(54)} | Target: ${tp} | SL: ${sl} | Trades: ${total} | Winrate: ${winrate}% | Net Pts: ${netPts.toFixed(2)}`);
            }
        }
    }

    console.log("\n==========================================================================");
    console.log("🏆 BEST ADVANCED COMBINED STRATEGY:");
    console.log(JSON.stringify(best, null, 2));
    console.log("==========================================================================");
}

runStrategySweep().catch(console.error);
