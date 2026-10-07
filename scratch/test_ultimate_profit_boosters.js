/**
 * Backtest Script to Test Profit Booster Strategies on September 2026 Data
 * Location: c:\AlgoTrade\scratch\test_ultimate_profit_boosters.js
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

async function runBoosterBacktest(options = {}) {
    const {
        slRupees = 80,
        enableDailyTarget = true,  // Stop trading if Day PnL >= +₹300
        enableDailyMaxLoss = true, // Stop trading if Day PnL <= -₹240
        enableSuperTrail = true   // Optimized Ladder Trailing
    } = options;

    const candleDir = path.join(__dirname, '../candle_data');
    const files = fs.readdirSync(candleDir)
        .filter(f => f.startsWith('candles_13_IDX_I_15m_2026-09') && f.endsWith('.json'))
        .sort();

    const lotSize = 25;
    const delta = 0.5;
    const initialSlIndexPts = slRupees / (lotSize * delta);

    let grandTotalTrades = 0;
    let grandWins = 0;
    let grandLosses = 0;
    let grandNetPnL = 0;
    const dailySummary = [];

    for (const file of files) {
        const filePath = path.join(candleDir, file);
        const candleData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const candles = candleData.data || candleData;

        if (!candles || candles.length === 0) continue;

        const dayDate = candles[0].date;
        let dayTrades = 0;
        let dayPnL = 0;
        let dayWins = 0;
        let dayLosses = 0;
        let active = null;
        let lastExitSecs = null;
        let stopDayTrading = false;

        for (let i = 0; i < candles.length; i++) {
            const tick = candles[i];
            const candleClose = Number(tick.close || tick.price);
            const candleHigh = Number(tick.high || candleClose);
            const candleLow = Number(tick.low || candleClose);
            const tickSecs = toSeconds(tick.time);
            const isLastCandleOfDay = (tickSecs >= (15 * 3600 + 15 * 60) || i === candles.length - 1);

            // 1. Process Active Position Exit Rules
            if (active) {
                const isBUY = active.type === 'BUY';
                
                const peakFavPts = isBUY ? (candleHigh - active.entryPrice) : (active.entryPrice - candleLow);
                const peakRupees = peakFavPts * delta * lotSize;
                if (peakRupees > active.maxPeakRupees) {
                    active.maxPeakRupees = peakRupees;
                }

                // Super Trail Shifts
                if (enableSuperTrail) {
                    if (active.maxPeakRupees >= 700) {
                        active.lockedRupees = 550;
                    } else if (active.maxPeakRupees >= 450) {
                        active.lockedRupees = 350;
                    } else if (active.maxPeakRupees >= 250) {
                        active.lockedRupees = 180;
                    } else if (active.maxPeakRupees >= 120) {
                        active.lockedRupees = 60;
                    }
                }

                if (active.lockedRupees > 0) {
                    const lockPts = active.lockedRupees / (lotSize * delta);
                    active.slIndexPrice = isBUY ? (active.entryPrice + lockPts) : (active.entryPrice - lockPts);
                }

                let exitReason = null;
                let exitPrice = candleClose;
                let pnlRupees = 0;

                if (isBUY) {
                    if (active.lockedRupees > 0 && candleLow <= active.slIndexPrice) {
                        exitReason = `SUPER_LOCK (+₹${active.lockedRupees})`;
                        pnlRupees = active.lockedRupees;
                    } else if (active.lockedRupees === 0 && candleLow <= active.slIndexPrice) {
                        exitReason = `INITIAL_SL_HIT (-₹${slRupees})`;
                        pnlRupees = -slRupees;
                    } else if (isLastCandleOfDay) {
                        exitReason = "EOD_SQUARE_OFF";
                        const pts = candleClose - active.entryPrice;
                        pnlRupees = Number((pts * delta * lotSize).toFixed(2));
                    }
                } else {
                    if (active.lockedRupees > 0 && candleHigh >= active.slIndexPrice) {
                        exitReason = `SUPER_LOCK (+₹${active.lockedRupees})`;
                        pnlRupees = active.lockedRupees;
                    } else if (active.lockedRupees === 0 && candleHigh >= active.slIndexPrice) {
                        exitReason = `INITIAL_SL_HIT (-₹${slRupees})`;
                        pnlRupees = -slRupees;
                    } else if (isLastCandleOfDay) {
                        exitReason = "EOD_SQUARE_OFF";
                        const pts = active.entryPrice - candleClose;
                        pnlRupees = Number((pts * delta * lotSize).toFixed(2));
                    }
                }

                if (exitReason) {
                    lastExitSecs = tickSecs;
                    dayTrades++;
                    grandTotalTrades++;
                    dayPnL += pnlRupees;
                    grandNetPnL += pnlRupees;

                    if (pnlRupees >= 0) {
                        dayWins++;
                        grandWins++;
                    } else {
                        dayLosses++;
                        grandLosses++;
                    }

                    // Check Daily Target / Daily Max Loss Guards
                    if (enableDailyTarget && dayPnL >= 300) {
                        stopDayTrading = true;
                    }
                    if (enableDailyMaxLoss && dayPnL <= -240) {
                        stopDayTrading = true;
                    }

                    active = null;
                }
            }

            const cooldownSatisfied = (lastExitSecs === null) || ((tickSecs - lastExitSecs) >= 900);

            if (!active && !stopDayTrading && cooldownSatisfied && tickSecs <= 54000 && dayTrades < 3) {
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

        dailySummary.push({
            date: dayDate,
            trades: dayTrades,
            wins: dayWins,
            losses: dayLosses,
            pnl: Number(dayPnL.toFixed(2))
        });
    }

    const winrate = grandTotalTrades > 0 ? ((grandWins / grandTotalTrades) * 100).toFixed(1) : 0;
    return { options, totalTrades: grandTotalTrades, wins: grandWins, losses: grandLosses, winrate, netPnL: Number(grandNetPnL.toFixed(2)), dailySummary };
}

async function main() {
    console.log("=== PROFIT BOOSTER STRATEGIES COMPARISON (SEPTEMBER 2026) ===");
    
    // Test 1: Tight SL ₹80 + Daily Lock
    const res1 = await runBoosterBacktest({ slRupees: 80, enableDailyTarget: true, enableDailyMaxLoss: true, enableSuperTrail: true });
    console.log(`\nBooster #1 [Tight SL ₹80 + Daily Lock + SuperTrail]: Net PnL = ₹${res1.netPnL} | WinRate = ${res1.winrate}% (${res1.wins}W / ${res1.losses}L) | Trades = ${res1.totalTrades}`);

    // Test 2: Tight SL ₹90 + Super Trail
    const res2 = await runBoosterBacktest({ slRupees: 90, enableDailyTarget: false, enableDailyMaxLoss: true, enableSuperTrail: true });
    console.log(`Booster #2 [SL ₹90 + SuperTrail + MaxLoss Guard]: Net PnL = ₹${res2.netPnL} | WinRate = ${res2.winrate}% (${res2.wins}W / ${res2.losses}L) | Trades = ${res2.totalTrades}`);

    // Test 3: SL ₹100 + Daily Profit Lock (+₹300)
    const res3 = await runBoosterBacktest({ slRupees: 100, enableDailyTarget: true, enableDailyMaxLoss: true, enableSuperTrail: true });
    console.log(`Booster #3 [SL ₹100 + Daily Profit Lock + SuperTrail]: Net PnL = ₹${res3.netPnL} | WinRate = ${res3.winrate}% (${res3.wins}W / ${res3.losses}L) | Trades = ${res3.totalTrades}`);
}

main();
