const fs = require('fs');
const path = require('path');
const { calculateVWAP } = require('../utility/usedfull/Engines/tools/indicators/trend/vwap');
const { calculateEMA } = require('../utility/usedfull/Engines/tools/indicators/trend/ema');
const { calculateRSI } = require('../utility/usedfull/Engines/tools/indicators/momentum/rsi');

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

function runSuperPatternOptimizer() {
    console.log("==========================================================================");
    console.log("⚡ [HIGH-ACCURACY PATTERN OPTIMIZER] Pushing Winrate to 80-90%");
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
    console.log(`✅ Loaded ${allCandles.length} candles.`);

    const vwapArr = calculateVWAP(allCandles);
    const ema20Arr = calculateEMA(allCandles, 20);
    const rsiArr = calculateRSI(allCandles, 14);

    const monthMap = {};
    allCandles.forEach(c => {
        const m = c.date.substring(0, 7);
        if (!monthMap[m]) monthMap[m] = [];
        monthMap[m].push(c);
    });
    const months = Object.keys(monthMap).sort();

    // 5 variations of Liquidity Sweep + Technical Filters
    const variations = [
        {
            id: "PURE_LIQUIDITY_SWEEP",
            name: "🎯 Liquidity Wick Sweep & Reversal (Pure Price Action)",
            rule: (c, i) => {
                if (i < 5) return null;
                const slice = allCandles.slice(i - 5, i);
                const priorHigh = Math.max(...slice.map(x => x.high || x.close));
                const priorLow = Math.min(...slice.map(x => x.low || x.close));

                const close = c.close || c.price;
                const open = c.open || close;
                const high = c.high || close;
                const low = c.low || close;

                const isBullSweep = low < priorLow && close > open && close > priorLow;
                const isBearSweep = high > priorHigh && close < open && close < priorHigh;

                if (isBullSweep) return "BUY";
                if (isBearSweep) return "SELL";
                return null;
            }
        },
        {
            id: "LIQUIDITY_SWEEP_VWAP",
            name: "🌊 Liquidity Wick Sweep + VWAP Alignment Filter",
            rule: (c, i) => {
                if (i < 5) return null;
                const vwap = vwapArr[i];
                if (vwap === null) return null;
                const slice = allCandles.slice(i - 5, i);
                const priorHigh = Math.max(...slice.map(x => x.high || x.close));
                const priorLow = Math.min(...slice.map(x => x.low || x.close));

                const close = c.close || c.price;
                const open = c.open || close;
                const high = c.high || close;
                const low = c.low || close;

                const isBullSweep = low < priorLow && close > open && close > priorLow && close > vwap;
                const isBearSweep = high > priorHigh && close < open && close < priorHigh && close < vwap;

                if (isBullSweep) return "BUY";
                if (isBearSweep) return "SELL";
                return null;
            }
        },
        {
            id: "LIQUIDITY_SWEEP_RSI_CONFIRM",
            name: "⚡ Liquidity Wick Sweep + RSI Momentum Confirmation (RSI > 50 / < 50)",
            rule: (c, i) => {
                if (i < 5) return null;
                const rsi = rsiArr[i];
                if (rsi === null) return null;
                const slice = allCandles.slice(i - 5, i);
                const priorHigh = Math.max(...slice.map(x => x.high || x.close));
                const priorLow = Math.min(...slice.map(x => x.low || x.close));

                const close = c.close || c.price;
                const open = c.open || close;
                const high = c.high || close;
                const low = c.low || close;

                const isBullSweep = low < priorLow && close > open && close > priorLow && rsi >= 50;
                const isBearSweep = high > priorHigh && close < open && close < priorHigh && rsi <= 50;

                if (isBullSweep) return "BUY";
                if (isBearSweep) return "SELL";
                return null;
            }
        },
        {
            id: "LIQUIDITY_SWEEP_MIN_WICK_RATIO",
            name: "🕯️ Liquidity Wick Sweep + Strong Wick Ratio (Lower/Upper Wick >= 40%)",
            rule: (c, i) => {
                if (i < 5) return null;
                const slice = allCandles.slice(i - 5, i);
                const priorHigh = Math.max(...slice.map(x => x.high || x.close));
                const priorLow = Math.min(...slice.map(x => x.low || x.close));

                const close = c.close || c.price;
                const open = c.open || close;
                const high = c.high || close;
                const low = c.low || close;
                const totalRange = high - low;
                if (totalRange <= 0) return null;

                const lowerWick = Math.min(open, close) - low;
                const upperWick = high - Math.max(open, close);

                const lowerWickRatio = lowerWick / totalRange;
                const upperWickRatio = upperWick / totalRange;

                const isBullSweep = low < priorLow && close > open && close > priorLow && lowerWickRatio >= 0.40;
                const isBearSweep = high > priorHigh && close < open && close < priorHigh && upperWickRatio >= 0.40;

                if (isBullSweep) return "BUY";
                if (isBearSweep) return "SELL";
                return null;
            }
        }
    ];

    const targetOpts = [30, 40, 50, 60, 70, 80];
    const slOpts = [20, 30, 40, 50];

    const results = [];

    for (const v of variations) {
        for (const tp of targetOpts) {
            for (const sl of slOpts) {
                let totalTrades = 0;
                let wins = 0;
                let losses = 0;
                let totalPts = 0;
                const monthlyPtsMap = {};
                months.forEach(m => monthlyPtsMap[m] = 0);

                let activePos = null;
                let dailyCountMap = {};

                for (let i = 10; i < allCandles.length; i++) {
                    const tick = allCandles[i];
                    const cClose = Number(tick.close || tick.price || 0);
                    const cHigh = Number(tick.high || cClose);
                    const cLow = Number(tick.low || cClose);
                    const mKey = tick.date.substring(0, 7);

                    if (activePos) {
                        const isBUY = activePos.type === "BUY";
                        const isTarget = isBUY ? cHigh >= activePos.target : cLow <= activePos.target;
                        const isSL = isBUY ? cLow <= activePos.sl : cHigh >= activePos.sl;
                        const isEOD = i === allCandles.length - 1 || allCandles[i + 1].date !== tick.date;

                        if (isTarget || isSL || isEOD) {
                            const exitPrice = isTarget ? activePos.target : (isSL ? activePos.sl : cClose);
                            const pts = isBUY ? (exitPrice - activePos.entry) : (activePos.entry - exitPrice);
                            const finalPts = Number(pts.toFixed(2));

                            totalTrades++;
                            if (finalPts >= 0) wins++;
                            else losses++;

                            totalPts += finalPts;
                            monthlyPtsMap[mKey] = (monthlyPtsMap[mKey] || 0) + finalPts;
                            activePos = null;
                        }
                    }

                    const dKey = tick.date;
                    const dCount = dailyCountMap[dKey] || 0;
                    const tickSecs = toSeconds(tick.time);
                    const cutoff1500 = 15 * 3600;

                    if (!activePos && dCount < 2 && tickSecs <= cutoff1500) {
                        const sig = v.rule(tick, i);
                        if (sig === "BUY" || sig === "SELL") {
                            dailyCountMap[dKey] = dCount + 1;
                            const entry = cClose;
                            const target = sig === "BUY" ? entry + tp : entry - tp;
                            const slPrice = sig === "BUY" ? entry - sl : entry + sl;
                            activePos = { type: sig, entry, target, sl: slPrice };
                        }
                    }
                }

                let greenMonths = 0;
                Object.keys(monthlyPtsMap).forEach(m => {
                    if (monthlyPtsMap[m] > 0) greenMonths++;
                });

                const winrateNum = totalTrades > 0 ? (wins / totalTrades * 100) : 0;

                results.push({
                    varId: v.id,
                    varName: v.name,
                    tp,
                    sl,
                    totalTrades,
                    wins,
                    losses,
                    winrate: `${winrateNum.toFixed(1)}%`,
                    winrateNum,
                    totalPts: Number(totalPts.toFixed(2)),
                    greenMonths,
                    monthPercent: `${((greenMonths / months.length) * 100).toFixed(1)}%`,
                    monthlyPtsMap
                });
            }
        }
    }

    results.sort((a, b) => {
        if (b.winrateNum !== a.winrateNum) return b.winrateNum - a.winrateNum;
        if (b.greenMonths !== a.greenMonths) return b.greenMonths - a.greenMonths;
        return b.totalPts - a.totalPts;
    });

    console.log("==========================================================================");
    console.log("👑 TOP ULTRA-HIGH WINRATE INTRADAY STRATEGY VARIATIONS:");
    console.log("==========================================================================\n");

    const top5 = results.slice(0, 5);
    top5.forEach((r, idx) => {
        console.log(`Rank #${idx + 1}: ${r.varName}`);
        console.log(`  -> ID: ${r.varId} | Target: ${r.tp} pts | SL: ${r.sl} pts`);
        console.log(`  -> Winrate: 🎯 ${r.winrate} (${r.wins} Wins / ${r.losses} Losses out of ${r.totalTrades} trades)`);
        console.log(`  -> Green Months: ${r.greenMonths} / ${months.length} (${r.monthPercent}) | Net Pts: +${r.totalPts} pts`);
        console.log(`  -> Monthly PnL: ${JSON.stringify(r.monthlyPtsMap)}\n`);
    });

    return results[0];
}

runSuperPatternOptimizer();
