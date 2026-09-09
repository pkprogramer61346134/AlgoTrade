const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const indicators = require('../indicators');

const DATA_DIR = "C:\\candle data";

function runORBPointsTest(rrRatio = 1.5) {
    const candles = loadAllCandlesFromDir(DATA_DIR);
    if (!candles || candles.length === 0) return;

    const ema200 = indicators.trend.calculateEMA(candles, 200);
    const rvol = indicators.volume.calculateRelativeVolume(candles, 20);
    const rsi = indicators.momentum.calculateRSI(candles, 14);

    const dayORB = {};
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (!c.date) continue;
        if (!dayORB[c.date]) dayORB[c.date] = { high: -Infinity, low: Infinity, count: 0 };
        if (dayORB[c.date].count < 3) {
            if (c.high > dayORB[c.date].high) dayORB[c.date].high = c.high;
            if (c.low < dayORB[c.date].low) dayORB[c.date].low = c.low;
            dayORB[c.date].count++;
        }
    }

    let activePos = null;
    let trades = [];
    const dailyTradeCount = {};

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];

        if (activePos) {
            let exitPrice = null;

            if (activePos.type === "BUY") {
                if (c.low <= activePos.stopLoss) exitPrice = activePos.stopLoss;
                else if (c.high >= activePos.targetPrice) exitPrice = activePos.targetPrice;
            } else if (activePos.type === "SELL") {
                if (c.high >= activePos.stopLoss) exitPrice = activePos.stopLoss;
                else if (c.low <= activePos.targetPrice) exitPrice = activePos.targetPrice;
            }

            if (exitPrice !== null) {
                let pts = activePos.type === "BUY" ? (exitPrice - activePos.entryPrice) : (activePos.entryPrice - exitPrice);
                trades.push({ ...activePos, exitPrice, exitDate: c.date, pointsGained: Number(pts.toFixed(2)), isWin: pts > 0 });
                activePos = null;
            }
        }

        if (!activePos && c.date && (dailyTradeCount[c.date] || 0) < 3) {
            const orb = dayORB[c.date];
            if (orb && orb.high !== -Infinity && orb.count >= 3) {
                const r = rvol[i] || 1.0;
                const e200 = ema200[i];
                const rsiVal = rsi[i] || 50;

                if (e200 && r >= 2.0) {
                    if (c.close > orb.high && c.close > e200 && rsiVal > 50) {
                        const sl = orb.low;
                        const riskPoints = c.close - sl;
                        if (riskPoints > 0) {
                            const tp = c.close + (rrRatio * riskPoints);
                            activePos = { type: "BUY", entryPrice: c.close, stopLoss: Number(sl.toFixed(2)), targetPrice: Number(tp.toFixed(2)), riskPoints: Number(riskPoints.toFixed(2)), entryDate: c.date, entryTime: c.time };
                            dailyTradeCount[c.date] = (dailyTradeCount[c.date] || 0) + 1;
                        }
                    } else if (c.close < orb.low && c.close < e200 && rsiVal < 50) {
                        const sl = orb.high;
                        const riskPoints = sl - c.close;
                        if (riskPoints > 0) {
                            const tp = c.close - (rrRatio * riskPoints);
                            activePos = { type: "SELL", entryPrice: c.close, stopLoss: Number(sl.toFixed(2)), targetPrice: Number(tp.toFixed(2)), riskPoints: Number(riskPoints.toFixed(2)), entryDate: c.date, entryTime: c.time };
                            dailyTradeCount[c.date] = (dailyTradeCount[c.date] || 0) + 1;
                        }
                    }
                }
            }
        }
    }

    const totalTrades = trades.length;
    const wins = trades.filter(t => t.isWin);
    const losses = trades.filter(t => !t.isWin);
    const winRate = totalTrades > 0 ? ((wins.length / totalTrades) * 100).toFixed(2) : 0;
    const totalPtsWon = wins.reduce((sum, t) => sum + t.pointsGained, 0);
    const totalPtsLost = Math.abs(losses.reduce((sum, t) => sum + t.pointsGained, 0));
    const netPts = totalPtsWon - totalPtsLost;
    const avgWinPts = wins.length > 0 ? (totalPtsWon / wins.length).toFixed(2) : 0;
    const avgLossPts = losses.length > 0 ? (totalPtsLost / losses.length).toFixed(2) : 0;

    console.log("=========================================================================================");
    console.log(`🎯 ORB BREAKOUT POINTS TEST (1:${rrRatio} RISK-TO-REWARD RATIO IN NIFTY POINTS)`);
    console.log("=========================================================================================");
    console.log(`- Total Trades Taken:        ${totalTrades} Trades`);
    console.log(`- Winning Trades:            ${wins.length} Wins`);
    console.log(`- Losing Trades:             ${losses.length} Losses`);
    console.log(`- Win Rate:                  ${winRate}% 🎯`);
    console.log(`- Avg Win Points:            +${avgWinPts} Points per Win Trade 📈`);
    console.log(`- Avg Loss Points:           -${avgLossPts} Points per Loss Trade 📉`);
    console.log(`- Total Positive Points Won: +${totalPtsWon.toFixed(2)} Points 🟢`);
    console.log(`- Total Negative Points Lost: -${totalPtsLost.toFixed(2)} Points 🔴`);
    console.log(`- NET POINTS PROFIT GAINED:  +${netPts.toFixed(2)} NET POINTS 🏆`);
    console.log("=========================================================================================\n");

    console.log("📌 SAMPLE RECENT TRADES IN POINTS (LAST 5 TRADES):");
    console.log("-----------------------------------------------------------------------------------------");
    trades.slice(-5).forEach(t => {
        const icon = t.isWin ? "🟢 WIN " : "🔴 LOSS";
        console.log(`📅 Date: ${t.entryDate} | Time: ${t.entryTime} | Type: ${t.type.padEnd(4)} | Entry: ${t.entryPrice} | SL: ${t.stopLoss} | Target: ${t.targetPrice} | Result: ${icon} | Points: ${t.pointsGained >= 0 ? '+' : ''}${t.pointsGained} Pts`);
    });
    console.log("-----------------------------------------------------------------------------------------\n");
}

if (require.main === module) {
    runORBPointsTest(1.5); // 1:1.5 R:R in Points
    runORBPointsTest(2.0); // 1:2 R:R in Points
}

module.exports = { runORBPointsTest };
