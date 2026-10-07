const fs = require('fs');
const path = require('path');
const { detectCandlestickPatterns } = require('../utility/usedfull/Engines/tools/indicators/price_action/candlestick_patterns');

// Cache dir
const cacheDir = path.join(__dirname, '../candle_data');

async function runCandlestickSweep() {
    console.log("==========================================================================");
    console.log("🔍 [8-YEAR CANDLESTICK PATTERN SWEEP] Testing Candlestick Patterns on 15m NIFTY");
    console.log("==========================================================================\n");

    const files = fs.readdirSync(cacheDir).filter(f => f.includes('15m') && f.endsWith('.json'));
    console.log(`📂 Loaded ${files.length} 15-minute historical candle cache files.`);

    // Load all candles sorted by date
    let allCandles = [];
    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf-8'));
            if (Array.isArray(data)) {
                allCandles = allCandles.concat(data);
            }
        } catch (e) {}
    }

    allCandles.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    console.log(`✅ Total 15-minute candles loaded: ${allCandles.length}`);

    // Candlestick Pattern variations to test
    const patternsToTest = [
        { name: "Bullish & Bearish Engulfing", buyPattern: "BULLISH_ENGULFING", sellPattern: "BEARISH_ENGULFING" },
        { name: "Hammer & Shooting Star", buyPattern: "HAMMER", sellPattern: "SHOOTING_STAR" },
        { name: "Bullish & Bearish Marubozu", buyPattern: "BULLISH_MARUBOZU", sellPattern: "BEARISH_MARUBOZU" },
        { name: "All Bullish & Bearish Patterns Combined", buyPattern: "ANY_BULLISH", sellPattern: "ANY_BEARISH" },
        { name: "Hammer Only (Buy) + Engulfing (Sell)", buyPattern: "HAMMER", sellPattern: "BEARISH_ENGULFING" },
        { name: "Engulfing (Buy) + Shooting Star (Sell)", buyPattern: "BULLISH_ENGULFING", sellPattern: "SHOOTING_STAR" }
    ];

    const targetPointsOptions = [30, 50, 70];
    const slPointsOptions = [15, 25, 35];

    let globalBest = null;

    for (const p of patternsToTest) {
        for (const tp of targetPointsOptions) {
            for (const sl of slPointsOptions) {
                let activePos = null;
                let trades = [];
                let dailyTrades = {};

                for (let i = 1; i < allCandles.length; i++) {
                    const tick = allCandles[i];
                    const candleClose = Number(tick.close || tick.candleClose || 0);
                    const candleHigh = Number(tick.high || tick.candleHigh || candleClose);
                    const candleLow = Number(tick.low || tick.candleLow || candleClose);

                    // 1. Process active position
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

                    // 2. Evaluate pattern signal
                    const dayKey = tick.date;
                    const dayCount = dailyTrades[dayKey] || 0;

                    if (!activePos && dayCount < 3) {
                        const slice = allCandles.slice(Math.max(0, i - 5), i + 1);
                        const detected = detectCandlestickPatterns(slice);

                        let isBuySignal = false;
                        let isSellSignal = false;

                        if (p.buyPattern === "ANY_BULLISH") {
                            isBuySignal = detected.some(d => d.type === "BULLISH");
                        } else {
                            isBuySignal = detected.some(d => d.name === p.buyPattern);
                        }

                        if (p.sellPattern === "ANY_BEARISH") {
                            isSellSignal = detected.some(d => d.type === "BEARISH");
                        } else {
                            isSellSignal = detected.some(d => d.name === p.sellPattern);
                        }

                        if (isBuySignal || isSellSignal) {
                            dailyTrades[dayKey] = dayCount + 1;
                            const type = isBuySignal ? "BUY" : "SELL";
                            const entry = candleClose;
                            const target = type === "BUY" ? entry + tp : entry - tp;
                            const slPrice = type === "BUY" ? entry - sl : entry + sl;

                            activePos = { type, entry, target, sl: slPrice };
                        }
                    }
                }

                const totalTrades = trades.length;
                const wins = trades.filter(t => t.result === "PASS").length;
                const losses = trades.filter(t => t.result === "LOSS").length;
                const winrate = totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) : "0.0";
                const netPoints = trades.reduce((sum, t) => sum + t.points, 0);

                const resultObj = {
                    patternName: p.name,
                    buyPattern: p.buyPattern,
                    sellPattern: p.sellPattern,
                    targetPts: tp,
                    slPts: sl,
                    totalTrades,
                    wins,
                    losses,
                    winrate: `${winrate}%`,
                    netPoints: Number(netPoints.toFixed(2))
                };

                if (!globalBest || resultObj.netPoints > globalBest.netPoints) {
                    globalBest = resultObj;
                }

                console.log(`[PATTERN] ${p.name.padEnd(42)} | Target: ${tp} | SL: ${sl} | Trades: ${totalTrades} | Winrate: ${winrate}% | Net Pts: ${netPoints.toFixed(2)}`);
            }
        }
    }

    console.log("\n==========================================================================");
    console.log("🏆 BEST CANDLESTICK PATTERN STRATEGY FOUND:");
    console.log(JSON.stringify(globalBest, null, 2));
    console.log("==========================================================================");
}

runCandlestickSweep().catch(console.error);
