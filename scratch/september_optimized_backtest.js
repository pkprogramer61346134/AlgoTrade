/**
 * Comparison Backtest for September 2026: Testing SL Optimization & Dynamic Step Trailing
 * Location: c:\AlgoTrade\scratch\september_optimized_backtest.js
 */

const fs = require('fs');
const path = require('path');
const { evaluateConsensusEngine } = require('../utility/usedfull/Engines/consensusEngine');

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

async function runOptimizedBacktest(slRupees, useStepTrailing) {
    const candleDir = path.join(__dirname, '../candle_data');
    const files = fs.readdirSync(candleDir)
        .filter(f => f.startsWith('candles_13_IDX_I_15m_2026-09') && f.endsWith('.json'))
        .sort();

    const lotSize = 25;
    const delta = 0.5; // 1 index pt = 12.5 Rs
    const initialSlIndexPts = slRupees / (lotSize * delta);

    let totalTrades = 0;
    let wins = 0;
    let losses = 0;
    let netPnL = 0;

    for (const file of files) {
        const filePath = path.join(candleDir, file);
        const candleData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const candles = candleData.data || candleData;
        if (!candles || candles.length === 0) continue;

        let dayTrades = 0;
        let active = null;
        let lastExitSecs = null;

        for (let i = 0; i < candles.length; i++) {
            const tick = candles[i];
            const candleClose = Number(tick.close || tick.price);
            const candleHigh = Number(tick.high || candleClose);
            const candleLow = Number(tick.low || candleClose);
            const tickSecs = toSeconds(tick.time);
            const isLastCandleOfDay = (tickSecs >= (15 * 3600 + 15 * 60) || i === candles.length - 1);

            if (active) {
                const isBUY = active.type === 'BUY';
                const peakFavPts = isBUY ? (candleHigh - active.entryPrice) : (active.entryPrice - candleLow);
                const peakRupees = peakFavPts * delta * lotSize;
                if (peakRupees > active.maxPeakRupees) {
                    active.maxPeakRupees = peakRupees;
                }

                // Trailing Logic
                if (useStepTrailing) {
                    // Dynamic breathing room trailing:
                    // Peak >= 120 -> Lock 60
                    // Peak >= 200 -> Lock 120
                    // Peak >= 300 -> Lock 200
                    if (active.maxPeakRupees >= 300) {
                        active.lockedRupees = 200;
                    } else if (active.maxPeakRupees >= 200) {
                        active.lockedRupees = 120;
                    } else if (active.maxPeakRupees >= 120) {
                        active.lockedRupees = 60;
                    }
                    if (active.lockedRupees > 0) {
                        const lockPts = active.lockedRupees / (lotSize * delta);
                        active.slIndexPrice = isBUY ? (active.entryPrice + lockPts) : (active.entryPrice - lockPts);
                    }
                } else {
                    // Fixed +₹60 Lock
                    if (active.maxPeakRupees >= 120 && active.lockedRupees === 0) {
                        active.lockedRupees = 60;
                        const lockPts = 60 / (lotSize * delta);
                        active.slIndexPrice = isBUY ? (active.entryPrice + lockPts) : (active.entryPrice - lockPts);
                    }
                }

                let exitReason = null;
                let pnlRupees = 0;

                if (isBUY) {
                    if (active.lockedRupees > 0 && candleLow <= active.slIndexPrice) {
                        exitReason = "TRAILING_LOCK";
                        pnlRupees = active.lockedRupees;
                    } else if (active.lockedRupees === 0 && candleLow <= active.slIndexPrice) {
                        exitReason = "INITIAL_SL";
                        pnlRupees = -slRupees;
                    } else if (isLastCandleOfDay) {
                        exitReason = "EOD";
                        const pts = candleClose - active.entryPrice;
                        pnlRupees = Number((pts * delta * lotSize).toFixed(2));
                    }
                } else {
                    if (active.lockedRupees > 0 && candleHigh >= active.slIndexPrice) {
                        exitReason = "TRAILING_LOCK";
                        pnlRupees = active.lockedRupees;
                    } else if (active.lockedRupees === 0 && candleHigh >= active.slIndexPrice) {
                        exitReason = "INITIAL_SL";
                        pnlRupees = -slRupees;
                    } else if (isLastCandleOfDay) {
                        exitReason = "EOD";
                        const pts = active.entryPrice - candleClose;
                        pnlRupees = Number((pts * delta * lotSize).toFixed(2));
                    }
                }

                if (exitReason) {
                    lastExitSecs = tickSecs;
                    dayTrades++;
                    totalTrades++;
                    netPnL += pnlRupees;
                    if (pnlRupees >= 0) wins++;
                    else losses++;
                    active = null;
                }
            }

            const cooldownSatisfied = (lastExitSecs === null) || ((tickSecs - lastExitSecs) >= 900);
            if (!active && cooldownSatisfied && tickSecs <= 54000 && dayTrades < 3) {
                const candleSlice = candles.slice(0, i + 1);
                const evalRes = await evaluateConsensusEngine(candleSlice, i, { date: tick.date, time: tick.time });
                if (evalRes.consensus === 'BUY' || evalRes.consensus === 'SELL') {
                    const entryPrice = candleClose;
                    const isBUY = evalRes.consensus === 'BUY';
                    const initialSlPrice = isBUY ? (entryPrice - initialSlIndexPts) : (entryPrice + initialSlIndexPts);
                    active = {
                        type: evalRes.consensus,
                        entryTime: tick.time,
                        entryPrice: entryPrice,
                        slIndexPrice: initialSlPrice,
                        lockedRupees: 0,
                        maxPeakRupees: 0
                    };
                }
            }
        }
    }

    const winrate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0;
    return { slRupees, useStepTrailing, totalTrades, wins, losses, winrate, netPnL: Number(netPnL.toFixed(2)) };
}

async function runAll() {
    console.log("=== SEPTEMBER 2026 STRATEGY OPTIMIZATION COMPARISON ===");
    const res1 = await runOptimizedBacktest(300, false);
    const res2 = await runOptimizedBacktest(120, false);
    const res3 = await runOptimizedBacktest(120, true);
    const res4 = await runOptimizedBacktest(100, true);

    console.log("\n1. Fixed +₹60 Lock | SL = ₹300 : Trades:", res1.totalTrades, "| Wins:", res1.wins, "| Losses:", res1.losses, "| WinRate:", res1.winrate + "% | Net PnL: ₹" + res1.netPnL);
    console.log("2. Fixed +₹60 Lock | SL = ₹120 : Trades:", res2.totalTrades, "| Wins:", res2.wins, "| Losses:", res2.losses, "| WinRate:", res2.winrate + "% | Net PnL: ₹" + res2.netPnL);
    console.log("3. Step Trailing   | SL = ₹120 : Trades:", res3.totalTrades, "| Wins:", res3.wins, "| Losses:", res3.losses, "| WinRate:", res3.winrate + "% | Net PnL: ₹" + res3.netPnL);
    console.log("4. Step Trailing   | SL = ₹100 : Trades:", res4.totalTrades, "| Wins:", res4.wins, "| Losses:", res4.losses, "| WinRate:", res4.winrate + "% | Net PnL: ₹" + res4.netPnL);
}

runAll();
