const fs = require('fs');
const path = require('path');
const { getOpeningRange } = require('../utility/usedfull/Engines/tools/indicators/market_context/opening_range');
const { getPreviousDayLevels } = require('../utility/usedfull/Engines/tools/indicators/market_context/previous_day_levels');
const { calculateVWAP } = require('../utility/usedfull/Engines/tools/indicators/trend/vwap');
const { calculateSupertrend } = require('../utility/usedfull/Engines/tools/indicators/trend/supertrend');
const { calculateRSI } = require('../utility/usedfull/Engines/tools/indicators/momentum/rsi');
const { calculateEMA } = require('../utility/usedfull/Engines/tools/indicators/trend/ema');

const cacheDir = path.join(__dirname, '../candle_data');

async function findUltimateStrategy() {
    console.log("==========================================================================");
    console.log("🏆 [QUANT LAB] Running Multi-Year Sweep to Find Highest Net-Profit Strategy");
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
    console.log(`✅ Total candles loaded: ${allCandles.length}`);

    // Precompute indicators
    const vwapArr = calculateVWAP(allCandles);
    const stArr = calculateSupertrend(allCandles, 10, 3);
    const rsiArr = calculateRSI(allCandles, 14);
    const ema10Arr = calculateEMA(allCandles, 10);
    const ema20Arr = calculateEMA(allCandles, 20);

    // Group by Date for day-level ORB & PDH/PDL
    const dayMap = {};
    allCandles.forEach(c => {
        if (!dayMap[c.date]) dayMap[c.date] = [];
        dayMap[c.date].push(c);
    });

    const dates = Object.keys(dayMap).sort();
    const orbPerDay = {};
    const prevDayMap = {};

    for (let dIdx = 0; dIdx < dates.length; dIdx++) {
        const d = dates[dIdx];
        const dayCandles = dayMap[d];
        const orb = getOpeningRange(dayCandles, 15, 15);
        if (orb) orbPerDay[d] = orb;

        if (dIdx > 0) {
            const prevCandles = dayMap[dates[dIdx - 1]];
            const pdh = Math.max(...prevCandles.map(c => c.high || c.close));
            const pdl = Math.min(...prevCandles.map(c => c.low || c.close));
            prevDayMap[d] = { pdh, pdl };
        }
    }

    const strategiesToTest = [
        {
            id: "SINGLE_ORB",
            name: "🌅 Strategy 1: Opening Range Breakout (ORB Only)",
            eval: (c, i) => {
                const orb = orbPerDay[c.date];
                if (!orb || orb.high === null) return null;
                const close = c.close || c.price;
                if (close > orb.high) return "BUY";
                if (close < orb.low) return "SELL";
                return null;
            }
        },
        {
            id: "ORB_WITH_VWAP",
            name: "⚡ Strategy 2: ORB Breakout + VWAP Trend Filter",
            eval: (c, i) => {
                const orb = orbPerDay[c.date];
                const vwap = vwapArr[i];
                if (!orb || orb.high === null || vwap === null) return null;
                const close = c.close || c.price;
                if (close > orb.high && close > vwap) return "BUY";
                if (close < orb.low && close < vwap) return "SELL";
                return null;
            }
        },
        {
            id: "PREV_DAY_BREAKOUT",
            name: "🎯 Strategy 3: Previous Day High/Low (PDH/PDL) Breakout",
            eval: (c, i) => {
                const pd = prevDayMap[c.date];
                if (!pd) return null;
                const close = c.close || c.price;
                if (close > pd.pdh) return "BUY";
                if (close < pd.pdl) return "SELL";
                return null;
            }
        },
        {
            id: "SUPERTREND_VWAP_EMA",
            name: "🔥 Strategy 4: Supertrend Signal + VWAP Filter + EMA 10/20 Stack",
            eval: (c, i) => {
                const st = stArr[i];
                const vwap = vwapArr[i];
                const e10 = ema10Arr[i];
                const e20 = ema20Arr[i];
                if (!st || vwap === null || e10 === null || e20 === null) return null;
                const close = c.close || c.price;
                const isStBull = st.direction === 1 || st.direction === "UP" || st.direction === "BUY";
                const isStBear = st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL";

                if (isStBull && close > vwap && e10 > e20) return "BUY";
                if (isStBear && close < vwap && e10 < e20) return "SELL";
                return null;
            }
        }
    ];

    const targetOpts = [50, 70, 100];
    const slOpts = [20, 35, 45];
    let allResults = [];

    for (const strat of strategiesToTest) {
        for (const tp of targetOpts) {
            for (const sl of slOpts) {
                let activePos = null;
                let trades = [];
                let dailyTrades = {};

                for (let i = 0; i < allCandles.length; i++) {
                    const tick = allCandles[i];
                    const candleClose = Number(tick.close || tick.candleClose || 0);
                    const candleHigh = Number(tick.high || tick.candleHigh || candleClose);
                    const candleLow = Number(tick.low || tick.candleLow || candleClose);

                    // 1. Position exit check
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

                    // 2. Entry signal check
                    const dayKey = tick.date;
                    const dayCount = dailyTrades[dayKey] || 0;

                    if (!activePos && dayCount < 3) {
                        const signal = strat.eval(tick, i);

                        if (signal === "BUY" || signal === "SELL") {
                            dailyTrades[dayKey] = dayCount + 1;
                            const type = signal;
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
                    id: strat.id,
                    name: strat.name,
                    target: tp,
                    sl: sl,
                    total,
                    wins,
                    losses: total - wins,
                    winrate: `${winrate}%`,
                    netPts: Number(netPts.toFixed(2))
                };

                allResults.push(res);
                console.log(`[SWEEP] ${strat.name.padEnd(56)} | Target: ${tp} | SL: ${sl} | Trades: ${total} | Winrate: ${winrate}% | Net Pts: +${netPts.toFixed(2)}`);
            }
        }
    }

    allResults.sort((a, b) => b.netPts - a.netPts);
    console.log("\n==========================================================================");
    console.log("🏆 TOP 3 BEST STRATEGIES BY NET PROFIT:");
    console.log(JSON.stringify(allResults.slice(0, 3), null, 2));
    console.log("==========================================================================");

    return allResults[0];
}

findUltimateStrategy().catch(console.error);
