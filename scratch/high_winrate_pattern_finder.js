const fs = require('fs');
const path = require('path');
const { calculateVWAP } = require('../utility/usedfull/Engines/tools/indicators/trend/vwap');
const { calculateEMA } = require('../utility/usedfull/Engines/tools/indicators/trend/ema');
const { getOpeningRange } = require('../utility/usedfull/Engines/tools/indicators/market_context/opening_range');
const { detectCandlestickPatterns } = require('../utility/usedfull/Engines/tools/indicators/price_action/candlestick_patterns');

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

function runPatternFinder() {
    console.log("==========================================================================");
    console.log("🔎 [INTRADAY PATTERN DISCOVERY] Testing High-Winrate Price Action Patterns");
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

    const vwapArr = calculateVWAP(allCandles);
    const ema20Arr = calculateEMA(allCandles, 20);
    const ema50Arr = calculateEMA(allCandles, 50);

    const monthMap = {};
    allCandles.forEach(c => {
        const m = c.date.substring(0, 7);
        if (!monthMap[m]) monthMap[m] = [];
        monthMap[m].push(c);
    });
    const months = Object.keys(monthMap).sort();

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

    // Define 10 intraday price action pattern detectors
    const patternsToTest = [
        {
            id: "INSIDE_BAR_BREAKOUT",
            name: "📦 Pattern 1: Inside Bar (Mother-Baby Candle) Breakout + VWAP",
            check: (c, i) => {
                if (i < 2) return null;
                const prev = allCandles[i - 1];
                const mother = allCandles[i - 2];
                const vwap = vwapArr[i];
                if (!prev || !mother || vwap === null) return null;

                // Inside bar check: prev candle is completely inside mother candle
                const isInsideBar = prev.high <= mother.high && prev.low >= mother.low;
                if (!isInsideBar) return null;

                const close = c.close || c.price;
                if (close > mother.high && close > vwap) return "BUY";
                if (close < mother.low && close < vwap) return "SELL";
                return null;
            }
        },
        {
            id: "VWAP_REJECTION_PINBAR",
            name: "🔨 Pattern 2: VWAP Bounce Hammer/Shooting Star Pinbar Rejection",
            check: (c, i) => {
                const vwap = vwapArr[i];
                if (vwap === null) return null;
                const close = c.close || c.price;
                const open = c.open || close;
                const high = c.high || close;
                const low = c.low || close;
                const totalRange = high - low;
                if (totalRange <= 0) return null;

                const bodySize = Math.abs(close - open);
                const upperWick = high - Math.max(open, close);
                const lowerWick = Math.min(open, close) - low;

                const isHammer = lowerWick >= (2 * bodySize) && upperWick <= (0.5 * bodySize);
                const isShootingStar = upperWick >= (2 * bodySize) && lowerWick <= (0.5 * bodySize);

                if (isHammer && low <= vwap && close > vwap) return "BUY";
                if (isShootingStar && high >= vwap && close < vwap) return "SELL";
                return null;
            }
        },
        {
            id: "BULL_BEAR_ENGULFING_VWAP",
            name: "🔥 Pattern 3: Engulfing Candle + VWAP Alignment",
            check: (c, i) => {
                if (i < 1) return null;
                const prev = allCandles[i - 1];
                const vwap = vwapArr[i];
                if (!prev || vwap === null) return null;

                const cClose = c.close || c.price;
                const cOpen = c.open || cClose;
                const pClose = prev.close || prev.price;
                const pOpen = prev.open || pClose;

                const isPrevRed = pClose < pOpen;
                const isCurrGreen = cClose > cOpen;
                const isBullEngulf = isPrevRed && isCurrGreen && cClose > pOpen && cOpen < pClose;

                const isPrevGreen = pClose > pOpen;
                const isCurrRed = cClose < cOpen;
                const isBearEngulf = isPrevGreen && isCurrRed && cClose < pOpen && cOpen > pClose;

                if (isBullEngulf && cClose > vwap) return "BUY";
                if (isBearEngulf && cClose < vwap) return "SELL";
                return null;
            }
        },
        {
            id: "LIQUIDITY_SWEEP_REVERSAL",
            name: "🎯 Pattern 4: Intraday Liquidity Wick Sweep & Reversal",
            check: (c, i) => {
                if (i < 5) return null;
                const slice = allCandles.slice(i - 5, i);
                const priorHigh = Math.max(...slice.map(x => x.high || x.close));
                const priorLow = Math.min(...slice.map(x => x.low || x.close));

                const close = c.close || c.price;
                const open = c.open || close;
                const high = c.high || close;
                const low = c.low || close;

                // Bear trap / Liquidity Sweep Low: low sweeps prior low but candle closes green above open
                const isBullSweep = low < priorLow && close > open && close > priorLow;
                // Bull trap / Liquidity Sweep High: high sweeps prior high but candle closes red below open
                const isBearSweep = high > priorHigh && close < open && close < priorHigh;

                if (isBullSweep) return "BUY";
                if (isBearSweep) return "SELL";
                return null;
            }
        },
        {
            id: "ORB_MARUBOZU_BREAKOUT",
            name: "⚡ Pattern 5: Opening Range Breakout + Marubozu Momentum Candle",
            check: (c, i) => {
                const orb = orbPerDay[c.date];
                if (!orb || orb.orbHigh === null) return null;
                const close = c.close || c.price;
                const open = c.open || close;
                const high = c.high || close;
                const low = c.low || close;
                const range = high - low;
                if (range <= 0) return null;

                const isMarubozu = Math.abs(close - open) / range >= 0.75;

                if (close > orb.orbHigh && isMarubozu && close > open) return "BUY";
                if (close < orb.orbLow && isMarubozu && close < open) return "SELL";
                return null;
            }
        },
        {
            id: "MOMENTUM_EXPANSION_3_CANDLES",
            name: "🚀 Pattern 6: 3-Candle Momentum Expansion + EMA 20 Alignment",
            check: (c, i) => {
                if (i < 3) return null;
                const c1 = allCandles[i - 2];
                const c2 = allCandles[i - 1];
                const c3 = c;
                const ema20 = ema20Arr[i];
                if (ema20 === null) return null;

                const is3Green = c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
                const is3Red = c1.close < c1.open && c2.close < c2.open && c3.close < c3.open;

                const close = c.close || c.price;
                if (is3Green && close > ema20) return "BUY";
                if (is3Red && close < ema20) return "SELL";
                return null;
            }
        }
    ];

    const targetOptions = [40, 60, 80, 100];
    const slOptions = [20, 30, 40, 50];
    const maxTradesOptions = [1, 2];

    const results = [];

    for (const pat of patternsToTest) {
        for (const tp of targetOptions) {
            for (const sl of slOptions) {
                for (const maxTrades of maxTradesOptions) {

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

                        if (!activePos && dCount < maxTrades && tickSecs <= cutoff1500) {
                            const sig = pat.check(tick, i);
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
                        patternId: pat.id,
                        patternName: pat.name,
                        tp,
                        sl,
                        maxTrades,
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
    }

    // Sort by Winrate first (aiming for highest winrate / accuracy), then Green Months, then total points
    results.sort((a, b) => {
        if (b.winrateNum !== a.winrateNum) return b.winrateNum - a.winrateNum;
        if (b.greenMonths !== a.greenMonths) return b.greenMonths - a.greenMonths;
        return b.totalPts - a.totalPts;
    });

    console.log("==========================================================================");
    console.log("🏆 TOP HIGH-WINRATE INTRADAY PATTERNS FOUND:");
    console.log("==========================================================================\n");

    const top10 = results.slice(0, 10);
    top10.forEach((r, idx) => {
        console.log(`Rank #${idx + 1}: ${r.patternName}`);
        console.log(`  -> Pattern ID: ${r.patternId} | Target: ${r.tp} pts | SL: ${r.sl} pts | MaxTrades: ${r.maxTrades}`);
        console.log(`  -> Winrate: 🎯 ${r.winrate} (${r.wins} Wins / ${r.losses} Losses out of ${r.totalTrades} trades)`);
        console.log(`  -> Green Months: ${r.greenMonths} / ${months.length} (${r.monthPercent}) | Net Pts: +${r.totalPts} pts`);
        console.log(`  -> Monthly PnL: ${JSON.stringify(r.monthlyPtsMap)}\n`);
    });

    return results[0];
}

runPatternFinder();
