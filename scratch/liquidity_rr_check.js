const fs = require('fs');
const path = require('path');
const { calculateVWAP } = require('../utility/usedfull/Engines/tools/indicators/trend/vwap');

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

function runLiquiditySweepRRCheck() {
    const files = fs.readdirSync(cacheDir).filter(f => f.includes('15m') && f.endsWith('.json'));
    let allCandles = [];
    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf-8'));
            if (Array.isArray(data)) allCandles = allCandles.concat(data);
        } catch (e) {}
    }
    allCandles.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    const monthMap = {};
    allCandles.forEach(c => {
        const m = c.date.substring(0, 7);
        if (!monthMap[m]) monthMap[m] = [];
        monthMap[m].push(c);
    });
    const months = Object.keys(monthMap).sort();

    const targetSLConfigs = [
        { tp: 60, sl: 30, maxTrades: 1 },
        { tp: 60, sl: 30, maxTrades: 2 },
        { tp: 80, sl: 40, maxTrades: 1 },
        { tp: 80, sl: 40, maxTrades: 2 },
        { tp: 50, sl: 25, maxTrades: 1 },
        { tp: 50, sl: 25, maxTrades: 2 }
    ];

    const results = [];

    for (const cfg of targetSLConfigs) {
        let totalTrades = 0;
        let wins = 0;
        let losses = 0;
        let totalPts = 0;
        const monthlyPtsMap = {};
        months.forEach(m => monthlyPtsMap[m] = 0);

        let activePos = null;
        let dailyCountMap = {};

        for (let i = 5; i < allCandles.length; i++) {
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

            if (!activePos && dCount < cfg.maxTrades && tickSecs <= cutoff1500) {
                const slice = allCandles.slice(i - 5, i);
                const priorHigh = Math.max(...slice.map(x => x.high || x.close));
                const priorLow = Math.min(...slice.map(x => x.low || x.close));

                const openP = tick.open || cClose;
                const rangeP = cHigh - cLow;
                const lowerWick = Math.min(openP, cClose) - cLow;
                const upperWick = cHigh - Math.max(openP, cClose);
                const lowerWickRatio = rangeP > 0 ? (lowerWick / rangeP) : 0;
                const upperWickRatio = rangeP > 0 ? (upperWick / rangeP) : 0;

                const isBullSweep = cLow < priorLow && cClose > openP && cClose > priorLow && lowerWickRatio >= 0.40;
                const isBearSweep = cHigh > priorHigh && cClose < openP && cClose < priorHigh && upperWickRatio >= 0.40;

                let sig = null;
                if (isBullSweep) sig = "BUY";
                else if (isBearSweep) sig = "SELL";

                if (sig === "BUY" || sig === "SELL") {
                    dailyCountMap[dKey] = dCount + 1;
                    const entry = cClose;
                    const target = sig === "BUY" ? entry + cfg.tp : entry - cfg.tp;
                    const slPrice = sig === "BUY" ? entry - cfg.sl : entry + cfg.sl;
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
            tp: cfg.tp,
            sl: cfg.sl,
            maxTrades: cfg.maxTrades,
            totalTrades,
            wins,
            losses,
            winrate: `${winrateNum.toFixed(1)}%`,
            winrateNum,
            totalPts: Number(totalPts.toFixed(2)),
            greenMonths,
            monthlyPtsMap
        });
    }

    results.sort((a, b) => b.totalPts - a.totalPts);

    console.log("==========================================================================");
    console.log("🎯 LIQUIDITY SWEEP RISK-REWARD OPTIMIZATION RESULTS:");
    console.log("==========================================================================");
    results.forEach(r => {
        console.log(`Target: ${r.tp} pts | SL: ${r.sl} pts | Max Trades: ${r.maxTrades}`);
        console.log(`  -> Winrate: 🎯 ${r.winrate} (${r.wins} Wins / ${r.losses} Losses out of ${r.totalTrades} trades)`);
        console.log(`  -> Green Months: ${r.greenMonths} / ${months.length} | Net Pts: 🟢 +${r.totalPts} pts`);
        console.log(`  -> Monthly PnL: ${JSON.stringify(r.monthlyPtsMap)}\n`);
    });
}

runLiquiditySweepRRCheck();
