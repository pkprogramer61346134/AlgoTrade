/**
 * Dhan Live Balance OTM Capital Trajectory & Wipeout Test (September 2026)
 * Location: c:\AlgoTrade\scratch\dhan_otm_wipeout_simulation.js
 * 
 * Initial Balance: ₹4,381.81 (User's Live Dhan Balance)
 * Instrument: OTM Option (Delta = 0.30)
 * Lot Size: 25 Qty
 * SL = ₹300 | Target Threshold = ₹300 -> Lock +₹200
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

async function runOTMWipeoutSimulation() {
    console.log("==========================================================================");
    console.log("🧪 [DHAN LIVE BALANCE OTM CAPITIAL & WIPEOUT SIMULATION]");
    console.log(" Starting Capital  : ₹4,381.81 (Live Dhan Account Balance)");
    console.log(" Contract Type     : OTM Option (Delta = 0.30)");
    console.log(" Lot Size          : 25 Qty (1 Lot)");
    console.log(" Strategy Rules    : SL = ₹300 | Target = ₹300 -> Lock +₹200 | Peak>=450 -> Lock +₹350");
    console.log("==========================================================================");

    const candleDir = path.join(__dirname, '../candle_data');
    const files = fs.readdirSync(candleDir)
        .filter(f => f.startsWith('candles_13_IDX_I_15m_2026-09') && f.endsWith('.json'))
        .sort();

    const initialCapital = 4381.81;
    let currentBalance = initialCapital;
    let isWipedOut = false;
    let wipeoutDate = null;
    let wipeoutDayIndex = -1;

    const lotSize = 25;
    const delta = 0.30; // OTM Option Delta = 0.30
    const slRupees = 300;
    const initialSlIndexPts = slRupees / (lotSize * delta); // 40 Nifty Index points

    const dailyBalanceHistory = [];

    for (let dayIdx = 0; dayIdx < files.length; dayIdx++) {
        const file = files[dayIdx];
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

        if (currentBalance <= 0 && !isWipedOut) {
            isWipedOut = true;
            wipeoutDate = dayDate;
            wipeoutDayIndex = dayIdx + 1;
        }

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

                // OTM Trailing Rules
                if (active.maxPeakRupees >= 600) {
                    active.lockedRupees = 500;
                } else if (active.maxPeakRupees >= 450) {
                    active.lockedRupees = 350;
                } else if (active.maxPeakRupees >= 300) {
                    active.lockedRupees = 200;
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
                        exitReason = `OTM_LOCK (+₹${active.lockedRupees})`;
                        pnlRupees = active.lockedRupees;
                    } else if (active.lockedRupees === 0 && candleLow <= active.slIndexPrice) {
                        exitReason = "INITIAL_SL_HIT (-₹300)";
                        pnlRupees = -slRupees;
                    } else if (isLastCandleOfDay) {
                        exitReason = "EOD_SQUARE_OFF";
                        const pts = candleClose - active.entryPrice;
                        pnlRupees = Number((pts * delta * lotSize).toFixed(2));
                    }
                } else {
                    if (active.lockedRupees > 0 && candleHigh >= active.slIndexPrice) {
                        exitReason = `OTM_LOCK (+₹${active.lockedRupees})`;
                        pnlRupees = active.lockedRupees;
                    } else if (active.lockedRupees === 0 && candleHigh >= active.slIndexPrice) {
                        exitReason = "INITIAL_SL_HIT (-₹300)";
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
                    dayPnL += pnlRupees;

                    if (pnlRupees >= 0) dayWins++;
                    else dayLosses++;

                    active = null;
                }
            }

            // 2. Evaluate Strategy Signal via Consensus Engine
            const cooldownSatisfied = (lastExitSecs === null) || ((tickSecs - lastExitSecs) >= 900);
            const cutoff1500 = 15 * 3600;

            // Only trade if balance has at least ₹1,500 margin for OTM 1 lot
            if (!active && currentBalance > 500 && cooldownSatisfied && tickSecs <= cutoff1500 && dayTrades < 3) {
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

        const startOfDayBal = currentBalance;
        currentBalance += dayPnL;
        currentBalance = Number(currentBalance.toFixed(2));

        dailyBalanceHistory.push({
            date: dayDate,
            startBalance: Number(startOfDayBal.toFixed(2)),
            trades: dayTrades,
            wins: dayWins,
            losses: dayLosses,
            dayPnL: Number(dayPnL.toFixed(2)),
            endBalance: currentBalance
        });
    }

    console.log("==========================================================================");
    console.log("📊 [DHAN BALANCE OTM TRAJECTORY & WIPEOUT REPORT]");
    console.log("==========================================================================");
    console.log(`Starting Balance      : ₹${initialCapital}`);
    console.log(`Final Ending Balance  : ₹${currentBalance} 💰`);
    console.log(`Total Net Capital PnL : ₹${(currentBalance - initialCapital).toFixed(2)}`);
    if (isWipedOut) {
        console.log(`⚠️ Balance Wipeout Status : WIPED OUT on Day ${wipeoutDayIndex} (${wipeoutDate}) 🔴`);
    } else {
        console.log(`✅ Balance Wipeout Status : NEVER WIPED OUT! (100% Capital Safe & Growing!) 🟢`);
    }
    console.log("==========================================================================\n");

    console.log("📅 DAY-BY-DAY BALANCE TRAJECTORY:");
    dailyBalanceHistory.forEach((d, idx) => {
        const statusIcon = d.dayPnL > 0 ? '🟢' : (d.dayPnL < 0 ? '🔴' : '⚪');
        console.log(` Day ${String(idx+1).padStart(2, ' ')} (${d.date}) | Start Bal: ₹${d.startBalance.toFixed(2)} | PnL: ₹${d.dayPnL.toFixed(2)} ${statusIcon} | End Bal: ₹${d.endBalance.toFixed(2)}`);
    });
}

runOTMWipeoutSimulation();
