/**
 * Custom Big Breathing Room Trailing Backtest (September 2026)
 * Location: c:\AlgoTrade\scratch\september_custom_breathing_backtest.js
 * 
 * Rules:
 * Peak >= ₹120 -> Lock +₹60 (Brokerage safety)
 * Peak >= ₹400 -> Lock +₹150 (Big Breathing Room, no early exit at 200/300)
 * Peak >= ₹600 -> Lock +₹300
 * Peak >= ₹800 -> Lock +₹500
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

async function runCustomBreathingBacktest(slRupees) {
    console.log("==========================================================================");
    console.log(`🧪 [BIG BREATHING ROOM TRAILING BACKTEST] September 2026 (Initial SL = ₹${slRupees})`);
    console.log(" Trailing Rules: Peak>=120 -> Lock +₹60 | Peak>=400 -> Lock +₹150 | Peak>=600 -> Lock +₹300 | Peak>=800 -> Lock +₹500");
    console.log("==========================================================================");

    const candleDir = path.join(__dirname, '../candle_data');
    const files = fs.readdirSync(candleDir)
        .filter(f => f.startsWith('candles_13_IDX_I_15m_2026-09') && f.endsWith('.json'))
        .sort();

    const lotSize = 25;
    const delta = 0.5; // 1 index pt = 12.5 Rs
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
                
                // Peak profit tracking
                const peakFavPts = isBUY ? (candleHigh - active.entryPrice) : (active.entryPrice - candleLow);
                const peakRupees = peakFavPts * delta * lotSize;
                if (peakRupees > active.maxPeakRupees) {
                    active.maxPeakRupees = peakRupees;
                }

                // Custom Big Breathing Room Shifts:
                if (active.maxPeakRupees >= 800) {
                    active.lockedRupees = 500;
                } else if (active.maxPeakRupees >= 600) {
                    active.lockedRupees = 300;
                } else if (active.maxPeakRupees >= 400) {
                    active.lockedRupees = 150;
                } else if (active.maxPeakRupees >= 120) {
                    active.lockedRupees = 60;
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
                        exitReason = `BIG_BREATHING_LOCK (+₹${active.lockedRupees})`;
                        exitPrice = active.slIndexPrice;
                        pnlRupees = active.lockedRupees;
                    } else if (active.lockedRupees === 0 && candleLow <= active.slIndexPrice) {
                        exitReason = `INITIAL_SL_HIT (-₹${slRupees})`;
                        exitPrice = active.slIndexPrice;
                        pnlRupees = -slRupees;
                    } else if (isLastCandleOfDay) {
                        exitReason = "EOD_SQUARE_OFF";
                        exitPrice = candleClose;
                        const pts = candleClose - active.entryPrice;
                        pnlRupees = Number((pts * delta * lotSize).toFixed(2));
                    }
                } else { // SELL / PE
                    if (active.lockedRupees > 0 && candleHigh >= active.slIndexPrice) {
                        exitReason = `BIG_BREATHING_LOCK (+₹${active.lockedRupees})`;
                        exitPrice = active.slIndexPrice;
                        pnlRupees = active.lockedRupees;
                    } else if (active.lockedRupees === 0 && candleHigh >= active.slIndexPrice) {
                        exitReason = `INITIAL_SL_HIT (-₹${slRupees})`;
                        exitPrice = active.slIndexPrice;
                        pnlRupees = -slRupees;
                    } else if (isLastCandleOfDay) {
                        exitReason = "EOD_SQUARE_OFF";
                        exitPrice = candleClose;
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

                    active = null;
                }
            }

            // 2. Evaluate Strategy Signal via Consensus Engine
            const cooldownSatisfied = (lastExitSecs === null) || ((tickSecs - lastExitSecs) >= 900);
            const cutoff1500 = 15 * 3600;

            if (!active && cooldownSatisfied && tickSecs <= cutoff1500 && dayTrades < 3) {
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

    console.log("==========================================================================");
    console.log(`📊 [BIG BREATHING ROOM SUMMARY - SL = ₹${slRupees}]`);
    console.log("==========================================================================");
    console.log(`Total Trading Days Tested : ${dailySummary.length}`);
    console.log(`Total Trades Executed     : ${grandTotalTrades}`);
    console.log(`Winning Trades (W)        : ${grandWins} 🟢`);
    console.log(`Losing Trades (L)         : ${grandLosses} 🔴`);
    const winrate = grandTotalTrades > 0 ? ((grandWins / grandTotalTrades) * 100).toFixed(1) : 0;
    console.log(`Win Rate                  : ${winrate}%`);
    console.log(`Net Total PnL (Rupees)    : ₹${grandNetPnL.toFixed(2)} 💰`);
    console.log("==========================================================================\n");

    console.log("📅 DAILY BREAKDOWN:");
    dailySummary.forEach(d => {
        const icon = d.pnl > 0 ? '🟢' : (d.pnl < 0 ? '🔴' : '⚪');
        console.log(` Date: ${d.date} | Trades: ${d.trades} (W:${d.wins} L:${d.losses}) | Net PnL: ₹${d.pnl.toFixed(2)} ${icon}`);
    });
}

async function main() {
    await runCustomBreathingBacktest(120);
    console.log("\n--------------------------------------------------------------------------\n");
    await runCustomBreathingBacktest(300);
}

main();
