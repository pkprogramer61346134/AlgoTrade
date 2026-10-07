const fs = require('fs');
const path = require('path');
const { calculateVWAP } = require('../utility/usedfull/Engines/tools/indicators/trend/vwap');
const { calculateSupertrend } = require('../utility/usedfull/Engines/tools/indicators/trend/supertrend');
const { calculateRSI } = require('../utility/usedfull/Engines/tools/indicators/momentum/rsi');
const { getOpeningRange } = require('../utility/usedfull/Engines/tools/indicators/market_context/opening_range');
const { calculateEMA } = require('../utility/usedfull/Engines/tools/indicators/trend/ema');
const { calculateATR } = require('../utility/usedfull/Engines/tools/indicators/volatility/atr');
const { detectCandlestickPatterns } = require('../utility/usedfull/Engines/tools/indicators/price_action/candlestick_patterns');
const { detectTrendlineBreakout } = require('../utility/usedfull/Engines/tools/indicators/price_action/trendline');

const cacheDir = path.join(__dirname, '../candle_data');

function toSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return 0;
    const cleanStr = timeStr.trim().toLowerCase();
    const isPM = cleanStr.includes("pm");
    const isAM = cleanStr.includes("am");
    const timeOnly = cleanStr.replace(/(am|pm)/gi, "").trim();
    const parts = timeOnly.split(":");
    let hours = parseInt(parts[0] || "0", 10);
    let minutes = parseInt(parts[1] || "0", 10);
    let seconds = parseInt(parts[2] || "0", 10);
    if (isPM && hours < 12) hours += 12;
    else if (isAM && hours === 12) hours = 0;
    return hours * 3600 + minutes * 60 + seconds;
}

async function runMonthlyOptimizer() {
    console.log("==========================================================================");
    console.log("🚀 [MONTH-BY-MONTH QUANT OPTIMIZER] Finding Strategy with 100% Green Months");
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
    console.log(`✅ Loaded ${allCandles.length} candles across ${files.length} cache files.`);

    // Group candles by Month ("YYYY-MM")
    const monthMap = {};
    allCandles.forEach(c => {
        const monthKey = c.date.substring(0, 7); // "YYYY-MM"
        if (!monthMap[monthKey]) monthMap[monthKey] = [];
        monthMap[monthKey].push(c);
    });

    const months = Object.keys(monthMap).sort();
    console.log(`📅 Available months (${months.length}):`, months.join(", "));

    // Precompute global indicators
    const vwapArr = calculateVWAP(allCandles);
    const stArr = calculateSupertrend(allCandles, 10, 3);
    const rsiArr = calculateRSI(allCandles, 14);
    const atrArr = calculateATR(allCandles, 14);
    const ema20Arr = calculateEMA(allCandles, 20);
    const ema50Arr = calculateEMA(allCandles, 50);

    // Group candles by day for ORB
    const dayMap = {};
    allCandles.forEach(c => {
        if (!dayMap[c.date]) dayMap[c.date] = [];
        dayMap[c.date].push(c);
    });

    const orbPerDay = {};
    Object.keys(dayMap).forEach(d => {
        const orb = getOpeningRange(dayMap[d], 15, 15);
        if (orb) orbPerDay[d] = orb;
    });

    // Define strategy candidate generator functions
    const strategyCandidates = [
        {
            id: "ORB_FILTERED_VWAP_ST",
            name: "⚡ Strategy #1: ORB Breakout + VWAP Filter + Supertrend Direction",
            rule: (c, i) => {
                const orb = orbPerDay[c.date];
                if (!orb || orb.orbHigh === null || orb.orbHigh === undefined) return null;
                const close = c.close || c.price;
                const vwap = vwapArr[i];
                const st = stArr[i];
                if (vwap === null || !st) return null;

                const isStBull = st.direction === 1 || st.direction === "UP" || st.direction === "BUY";
                const isStBear = st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL";

                if (close > orb.orbHigh && close > vwap && isStBull) return "BUY";
                if (close < orb.orbLow && close < vwap && isStBear) return "SELL";
                return null;
            }
        },
        {
            id: "PURE_ORB_DYNAMIC",
            name: "🌅 Strategy #2: High-Velocity Opening Range Breakout (ORB Only)",
            rule: (c, i) => {
                const orb = orbPerDay[c.date];
                if (!orb || orb.orbHigh === null || orb.orbHigh === undefined) return null;
                const close = c.close || c.price;
                if (close > orb.orbHigh) return "BUY";
                if (close < orb.orbLow) return "SELL";
                return null;
            }
        },
        {
            id: "VWAP_BOLL_MOMENTUM",
            name: "🌊 Strategy #3: VWAP Rebound + RSI Momentum Filter (RSI > 55 / < 45)",
            rule: (c, i) => {
                const vwap = vwapArr[i];
                const rsi = rsiArr[i];
                if (vwap === null || rsi === null) return null;
                const close = c.close || c.price;

                if (close > vwap && rsi >= 55) return "BUY";
                if (close < vwap && rsi <= 45) return "SELL";
                return null;
            }
        },
        {
            id: "SUPERTREND_EMA_CROSS",
            name: "🔥 Strategy #4: Supertrend Trend Alignment + EMA 20/50 Golden Cross",
            rule: (c, i) => {
                const st = stArr[i];
                const e20 = ema20Arr[i];
                const e50 = ema50Arr[i];
                if (!st || e20 === null || e50 === null) return null;
                const close = c.close || c.price;

                const isStBull = st.direction === 1 || st.direction === "UP" || st.direction === "BUY";
                const isStBear = st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL";

                if (isStBull && e20 > e50) return "BUY";
                if (isStBear && e20 < e50) return "SELL";
                return null;
            }
        },
        {
            id: "PRICEACTION_CANDLE_TRENDLINE",
            name: "🕯️ Strategy #5: Hammer/Star Candlestick + Trendline Breakout + VWAP",
            rule: (c, i, slice) => {
                const vwap = vwapArr[i];
                if (vwap === null) return null;
                const close = c.close || c.price;
                const patterns = detectCandlestickPatterns(slice);
                const tl = detectTrendlineBreakout(slice);

                const hasBull = patterns.some(p => p.name === "HAMMER" || p.name === "BULLISH_ENGULFING") || tl.bullishBreakout;
                const hasBear = patterns.some(p => p.name === "SHOOTING_STAR" || p.name === "BEARISH_ENGULFING") || tl.bearishBreakout;

                if (hasBull && close > vwap) return "BUY";
                if (hasBear && close < vwap) return "SELL";
                return null;
            }
        }
    ];

    const targetOptions = [40, 50, 60, 70, 80];
    const slOptions = [20, 25, 30, 35];
    const maxTradesOptions = [1, 2, 3];

    let evaluatedConfigurations = [];

    for (const strat of strategyCandidates) {
        for (const tp of targetOptions) {
            for (const sl of slOptions) {
                for (const maxTrades of maxTradesOptions) {

                    const monthlyPerformance = {};
                    months.forEach(m => { monthlyPerformance[m] = 0; });

                    let totalNetPoints = 0;
                    let totalTradesCount = 0;
                    let winningTradesCount = 0;
                    let losingTradesCount = 0;

                    let activePos = null;
                    let dailyTrades = {};

                    for (let i = 20; i < allCandles.length; i++) {
                        const tick = allCandles[i];
                        const candleClose = Number(tick.close || tick.candleClose || 0);
                        const candleHigh = Number(tick.high || tick.candleHigh || candleClose);
                        const candleLow = Number(tick.low || tick.candleLow || candleClose);
                        const monthKey = tick.date.substring(0, 7);

                        // 1. Process active position
                        if (activePos) {
                            const isBUY = activePos.type === "BUY";
                            let isTarget = isBUY ? candleHigh >= activePos.target : candleLow <= activePos.target;
                            let isSL = isBUY ? candleLow <= activePos.sl : candleHigh >= activePos.sl;
                            let isEOD = i === allCandles.length - 1 || allCandles[i+1].date !== tick.date;

                            if (isTarget || isSL || isEOD) {
                                const exitPrice = isTarget ? activePos.target : (isSL ? activePos.sl : candleClose);
                                const pts = isBUY ? (exitPrice - activePos.entry) : (activePos.entry - exitPrice);
                                const finalPts = Number(pts.toFixed(2));

                                totalTradesCount++;
                                if (finalPts >= 0) winningTradesCount++;
                                else losingTradesCount++;

                                totalNetPoints += finalPts;
                                monthlyPerformance[monthKey] = (monthlyPerformance[monthKey] || 0) + finalPts;
                                activePos = null;
                            }
                        }

                        // 2. Evaluate entry signal before 3:00 PM
                        const dayKey = tick.date;
                        const dayCount = dailyTrades[dayKey] || 0;
                        const tickSecs = toSeconds(tick.time);
                        const cutoff1500 = 15 * 3600;

                        if (!activePos && dayCount < maxTrades && tickSecs <= cutoff1500) {
                            const slice = allCandles.slice(0, i + 1);
                            const signal = strat.rule(tick, i, slice);

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

                    // Calculate Green vs Red Months count
                    let greenMonths = 0;
                    let redMonths = 0;
                    let minMonthPts = 999999;

                    Object.keys(monthlyPerformance).forEach(m => {
                        const mPts = Number(monthlyPerformance[m].toFixed(2));
                        if (mPts > 0) greenMonths++;
                        else redMonths++;
                        if (mPts < minMonthPts) minMonthPts = mPts;
                    });

                    const winrate = totalTradesCount > 0 ? (winningTradesCount / totalTradesCount * 100).toFixed(1) : "0.0";

                    evaluatedConfigurations.push({
                        stratId: strat.id,
                        stratName: strat.name,
                        tp,
                        sl,
                        maxTrades,
                        totalTrades: totalTradesCount,
                        wins: winningTradesCount,
                        losses: losingTradesCount,
                        winrate: `${winrate}%`,
                        totalNetPoints: Number(totalNetPoints.toFixed(2)),
                        greenMonths,
                        redMonths,
                        monthPercentile: `${((greenMonths / months.length) * 100).toFixed(1)}%`,
                        minMonthPts,
                        monthlyPerformance
                    });

                }
            }
        }
    }

    // Sort configurations by Most Green Months first, then highest total Net Points
    evaluatedConfigurations.sort((a, b) => {
        if (b.greenMonths !== a.greenMonths) return b.greenMonths - a.greenMonths;
        return b.totalNetPoints - a.totalNetPoints;
    });

    const topWinner = evaluatedConfigurations[0];

    console.log("==========================================================================");
    console.log("🏆 BEST HIGH-PROFIT STRATEGY ACROSS ALL MONTHS FOUND:");
    console.log("==========================================================================");
    console.log(`Strategy ID: ${topWinner.stratId}`);
    console.log(`Strategy Name: ${topWinner.stratName}`);
    console.log(`Target: ${topWinner.tp} pts | SL: ${topWinner.sl} pts | Max Trades/Day: ${topWinner.maxTrades}`);
    console.log(`Green Months: ${topWinner.greenMonths} / ${months.length} (${topWinner.monthPercentile})`);
    console.log(`Total Net Points: +${topWinner.totalNetPoints} pts`);
    console.log(`Winrate: ${topWinner.winrate} (${topWinner.wins} Wins / ${topWinner.losses} Losses)`);
    console.log("\n📅 MONTHLY BREAKDOWN:");
    Object.keys(topWinner.monthlyPerformance).forEach(m => {
        const pts = topWinner.monthlyPerformance[m].toFixed(2);
        const icon = pts > 0 ? "🟢 GREEN" : "🔴 RED";
        console.log(`  - ${m}: ${pts} pts (${icon})`);
    });
    console.log("==========================================================================\n");

    // Automatically update master_strategy.json with the top winning strategy!
    const masterStrategyContent = [
        {
          "id": topWinner.stratId,
          "name": topWinner.stratName,
          "winrate": topWinner.winrate,
          "riskRewardRatio": Number((topWinner.tp / topWinner.sl).toFixed(2)),
          "indicators": {
            "orbDurationMinutes": 15,
            "targetPoints": topWinner.tp,
            "slPoints": topWinner.sl,
            "maxTradesPerDay": topWinner.maxTrades
          },
          "rules": {
            "buy": [
              {
                "target": "orb",
                "condition": "aboveHigh"
              }
            ],
            "sell": [
              {
                "target": "orb",
                "condition": "belowLow"
              }
            ]
          }
        }
    ];

    const masterPath = path.join(__dirname, '../utility/usedfull/Engines/strategies/master_strategy.json');
    fs.writeFileSync(masterPath, JSON.stringify(masterStrategyContent, null, 2), 'utf-8');
    console.log(`💾 [MASTER STRATEGY UPDATED] Successfully written top winning strategy to master_strategy.json!`);

    return topWinner;
}

runMonthlyOptimizer().catch(console.error);
