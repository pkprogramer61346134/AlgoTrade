const fs = require('fs');
const path = require('path');
const { calculateVWAP } = require('../utility/usedfull/Engines/tools/indicators/trend/vwap');
const { calculateSupertrend } = require('../utility/usedfull/Engines/tools/indicators/trend/supertrend');
const { calculateRSI } = require('../utility/usedfull/Engines/tools/indicators/momentum/rsi');
const { getOpeningRange } = require('../utility/usedfull/Engines/tools/indicators/market_context/opening_range');
const { calculateRelativeVolume } = require('../utility/usedfull/Engines/tools/indicators/volume/relative_volume');
const { calculateEMA } = require('../utility/usedfull/Engines/tools/indicators/trend/ema');
const { detectCandlestickPatterns } = require('../utility/usedfull/Engines/tools/indicators/price_action/candlestick_patterns');

const cacheDir = path.join(__dirname, '../candle_data');

async function findUltraStrategy() {
    console.log("==========================================================================");
    console.log("🧠 [QUANT ALPHA ENGINE] Searching for Ultimate High-Winrate Strategy on 15m NIFTY");
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
    console.log(`✅ Total 15-minute historical candles: ${allCandles.length}`);

    // Precompute indicators across dataset
    const vwapArr = calculateVWAP(allCandles);
    const stArr = calculateSupertrend(allCandles, 10, 3);
    const rsiArr = calculateRSI(allCandles, 14);
    const rvolArr = calculateRelativeVolume(allCandles, 20);
    const ema20 = calculateEMA(allCandles, 20);
    const ema50 = calculateEMA(allCandles, 50);

    // Compute ORB per day
    const orbMap = {};
    const dayCandlesMap = {};
    allCandles.forEach(c => {
        if (!dayCandlesMap[c.date]) dayCandlesMap[c.date] = [];
        dayCandlesMap[c.date].push(c);
    });
    Object.keys(dayCandlesMap).forEach(d => {
        const orb = getOpeningRange(dayCandlesMap[d], 15, 15);
        if (orb) orbMap[d] = orb;
    });

    const strategiesToTest = [
        {
            id: "ALPHA_ORB_VWAP_SUPERTREND",
            name: "🚀 Alpha #1: ORB Breakout + VWAP Trend + Supertrend Direction",
            rules: (c, i) => {
                const orb = orbMap[c.date];
                if (!orb || orb.high === null) return { buy: false, sell: false };
                const vwap = vwapArr[i];
                const st = stArr[i];
                const close = c.close || c.price;

                const isStBull = st && (st.direction === 1 || st.direction === "UP" || st.direction === "BUY");
                const isStBear = st && (st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL");

                const buy = close > orb.high && vwap !== null && close > vwap && isStBull;
                const sell = close < orb.low && vwap !== null && close < vwap && isStBear;
                return { buy, sell };
            }
        },
        {
            id: "ALPHA_SUPERTREND_RSI_VOL",
            name: "⚡ Alpha #2: Supertrend Signal + RSI Trend Confirmation + Relative Volume Spike",
            rules: (c, i) => {
                const st = stArr[i];
                const rsi = rsiArr[i];
                const rvol = rvolArr[i] || 1.0;
                const close = c.close || c.price;
                const vwap = vwapArr[i];

                const isStBull = st && (st.direction === 1 || st.direction === "UP" || st.direction === "BUY");
                const isStBear = st && (st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL");

                const buy = isStBull && vwap !== null && close > vwap && (rsi !== null && rsi >= 55) && rvol >= 1.2;
                const sell = isStBear && vwap !== null && close < vwap && (rsi !== null && rsi <= 45) && rvol >= 1.2;
                return { buy, sell };
            }
        },
        {
            id: "ALPHA_EMA_CROSS_VWAP_ORB",
            name: "🔥 Alpha #3: EMA 20/50 Golden Cross + VWAP Filter + ORB Alignment",
            rules: (c, i) => {
                const eFast = ema20[i];
                const eSlow = ema50[i];
                const vwap = vwapArr[i];
                const orb = orbMap[c.date];
                const close = c.close || c.price;

                if (eFast === null || eSlow === null || !orb) return { buy: false, sell: false };

                const buy = eFast > eSlow && close > vwap && close > orb.high;
                const sell = eFast < eSlow && close < vwap && close < orb.low;
                return { buy, sell };
            }
        },
        {
            id: "ALPHA_CANDLESTICK_VWAP_SUPERTREND",
            name: "🕯️ Alpha #4: Hammer/ShootingStar + VWAP + Supertrend Confirmation",
            rules: (c, i, slice) => {
                const vwap = vwapArr[i];
                const st = stArr[i];
                const close = c.close || c.price;
                const patterns = detectCandlestickPatterns(slice);

                const isStBull = st && (st.direction === 1 || st.direction === "UP" || st.direction === "BUY");
                const isStBear = st && (st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL");

                const hasHammer = patterns.some(p => p.name === "HAMMER" || p.name === "BULLISH_ENGULFING");
                const hasStar = patterns.some(p => p.name === "SHOOTING_STAR" || p.name === "BEARISH_ENGULFING");

                const buy = hasHammer && vwap !== null && close > vwap && isStBull;
                const sell = hasStar && vwap !== null && close < vwap && isStBear;
                return { buy, sell };
            }
        },
        {
            id: "ALPHA_PURE_ORB_ONLY",
            name: "🌅 Alpha #5: Pure Opening Range Breakout (ORB 15m)",
            rules: (c, i) => {
                const orb = orbMap[c.date];
                if (!orb || orb.high === null) return { buy: false, sell: false };
                const close = c.close || c.price;
                return { buy: close > orb.high, sell: close < orb.low };
            }
        }
    ];

    const targetOpts = [50, 70, 90];
    const slOpts = [20, 35, 40];
    let allResults = [];

    for (const strat of strategiesToTest) {
        for (const tp of targetOpts) {
            for (const sl of slOpts) {
                let activePos = null;
                let trades = [];
                let dailyTrades = {};

                for (let i = 20; i < allCandles.length; i++) {
                    const tick = allCandles[i];
                    const candleClose = Number(tick.close || tick.candleClose || 0);
                    const candleHigh = Number(tick.high || tick.candleHigh || candleClose);
                    const candleLow = Number(tick.low || tick.candleLow || candleClose);

                    // 1. Position evaluation
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

                    // 2. Entry signal
                    const dayKey = tick.date;
                    const dayCount = dailyTrades[dayKey] || 0;

                    if (!activePos && dayCount < 3) {
                        const slice = allCandles.slice(0, i + 1);
                        const { buy, sell } = strat.rules(tick, i, slice);

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
                console.log(`[STRATEGY] ${strat.name.padEnd(62)} | Target: ${tp} | SL: ${sl} | Trades: ${total} | Winrate: ${winrate}% | Net Pts: ${netPts.toFixed(2)}`);
            }
        }
    }

    allResults.sort((a, b) => b.netPts - a.netPts);
    console.log("\n==========================================================================");
    console.log("🏆 TOP 3 HIGHEST NET-PROFIT STRATEGIES FOUND ACROSS HISTORICAL DATA:");
    console.log(JSON.stringify(allResults.slice(0, 3), null, 2));
    console.log("==========================================================================");
}

findUltraStrategy().catch(console.error);
