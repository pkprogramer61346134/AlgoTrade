/**
 * Backtest September 2026 WITHOUT Trailing SL Lock (Pure Target vs SL vs Candle Close)
 * Location: c:\AlgoTrade\scratch\september_no_trailing_backtest.js
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

async function runSeptemberNoTrailingBacktest() {
    console.log("==========================================================================");
    console.log("🧪 [SEPTEMBER 2026 BACKTEST] WITHOUT +₹60 Trailing SL Lock");
    console.log("==========================================================================");

    const candleDir = path.join(__dirname, '../candle_data');
    const files = fs.readdirSync(candleDir)
        .filter(f => f.startsWith('candles_13_IDX_I_15m_2026-09') && f.endsWith('.json'))
        .sort();

    const lotSize = 25;
    const delta = 0.5; // 1 index pt = 12.5 Rs
    const initialSlRupees = 300;
    const initialSlIndexPts = initialSlRupees / (lotSize * delta); // 24 pts
    const targetRupees = 700; // Target +70 pts = +₹700
    const targetIndexPts = targetRupees / (lotSize * delta); // 56 pts

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

            // 1. Process Active Position Exit Rules (No Trailing SL Lock!)
            if (active) {
                const isBUY = active.type === 'BUY';
                let exitReason = null;
                let exitPrice = candleClose;
                let pnlRupees = 0;

                if (isBUY) {
                    if (candleHigh >= active.targetPrice) {
                        exitReason = "TARGET_HIT (+₹700)";
                        exitPrice = active.targetPrice;
                        pnlRupees = targetRupees;
                    } else if (candleLow <= active.slPrice) {
                        exitReason = "INITIAL_SL_HIT (-₹300)";
                        exitPrice = active.slPrice;
                        pnlRupees = -initialSlRupees;
                    } else if (isLastCandleOfDay) {
                        exitReason = "EOD_SQUARE_OFF";
                        exitPrice = candleClose;
                        const pts = candleClose - active.entryPrice;
                        pnlRupees = Number((pts * delta * lotSize).toFixed(2));
                    }
                } else { // SELL / PE
                    if (candleLow <= active.targetPrice) {
                        exitReason = "TARGET_HIT (+₹700)";
                        exitPrice = active.targetPrice;
                        pnlRupees = targetRupees;
                    } else if (candleHigh >= active.slPrice) {
                        exitReason = "INITIAL_SL_HIT (-₹300)";
                        exitPrice = active.slPrice;
                        pnlRupees = -initialSlRupees;
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
                    const slPrice = isBUY ? (entryPrice - initialSlIndexPts) : (entryPrice + initialSlIndexPts);
                    const targetPrice = isBUY ? (entryPrice + targetIndexPts) : (entryPrice - targetIndexPts);

                    active = {
                        type: evalRes.consensus,
                        entryTime: tick.time,
                        entryPrice: entryPrice,
                        slPrice: slPrice,
                        targetPrice: targetPrice
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
    console.log("📊 [SEPTEMBER 2026 NO TRAILING LOCK SUMMARY]");
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

runSeptemberNoTrailingBacktest();
