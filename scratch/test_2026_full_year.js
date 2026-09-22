/**
 * 2026 Out-of-Sample Backtest for High Conviction 100-Point Score (>= 78/100)
 */

const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

const candleDir = path.join(__dirname, '../candle_data');
const files = fs.readdirSync(candleDir).filter(f => {
    return f.endsWith('.json') && f.includes('2026');
});

let candles2026 = [];
files.forEach(f => {
    try {
        const filePath = path.join(candleDir, f);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Array.isArray(data)) {
            candles2026 = candles2026.concat(data);
        }
    } catch (e) {}
});

const seen = new Set();
const uniqueCandles = [];
candles2026.forEach(c => {
    const key = `${c.date}_${c.time}`;
    if (!seen.has(key)) {
        seen.add(key);
        uniqueCandles.push(c);
    }
});

uniqueCandles.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.time || '').localeCompare(b.time || '');
});

const strategyConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../strategies_config/consensus_master_head.json'), 'utf8'));
strategyConfig.validSetupScoreThreshold = 78; // Require 78+ Score for High Conviction Entries

const data = prepareJSONStrategyData(uniqueCandles, strategyConfig);

const initialCapital = 100000;
let runningCapital = initialCapital;
let activeTrade = null;
const completedTrades = [];
const dailyTradeCounts = {};
const dailyPnL = {};

const monthlyPnL = {};

for (let i = 0; i < uniqueCandles.length; i++) {
    const c = uniqueCandles[i];
    if (!c.time || !c.date) continue;

    const monthKey = c.date.substring(0, 7);
    if (!monthlyPnL[monthKey]) monthlyPnL[monthKey] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
    if (dailyPnL[c.date] === undefined) dailyPnL[c.date] = 0;

    if (dailyPnL[c.date] <= strategyConfig.dailyMaxLossCap || dailyPnL[c.date] >= strategyConfig.dailyTargetProfitLock) {
        continue;
    }

    if (activeTrade) {
        const currentPrem = activeTrade.optionType === "CE" 
            ? activeTrade.optionPremiumPrice + (c.close - activeTrade.spotEntryPrice) * 0.5
            : activeTrade.optionPremiumPrice + (activeTrade.spotEntryPrice - c.close) * 0.5;

        const isCEHitSL = activeTrade.optionType === "CE" && c.low <= activeTrade.spotSL;
        const isCEHitTP = activeTrade.optionType === "CE" && c.high >= activeTrade.spotTarget;
        const isPEHitSL = activeTrade.optionType === "PE" && c.high >= activeTrade.spotSL;
        const isPEHitTP = activeTrade.optionType === "PE" && c.low <= activeTrade.spotTarget;

        let exitReason = null;
        let exitPrice = c.close;
        let exitPremium = currentPrem;

        if (isCEHitSL || isPEHitSL) {
            exitReason = "SL HIT";
            exitPrice = activeTrade.spotSL;
            exitPremium = activeTrade.optionSL;
        } else if (isCEHitTP || isPEHitTP) {
            exitReason = "TARGET HIT";
            exitPrice = activeTrade.spotTarget;
            exitPremium = activeTrade.target;
        } else if (c.time >= "15:00") {
            exitReason = "3:00 PM EOD";
            exitPrice = c.close;
            exitPremium = currentPrem;
        }

        if (exitReason) {
            const ptsPnl = Number((exitPremium - activeTrade.optionPremiumPrice).toFixed(2));
            const rupeePnl = Number((ptsPnl * activeTrade.quantity).toFixed(2));
            runningCapital += rupeePnl;
            dailyPnL[activeTrade.entryDate] += rupeePnl;

            const tradeMonth = activeTrade.entryDate.substring(0, 7);
            if (monthlyPnL[tradeMonth]) {
                monthlyPnL[tradeMonth].trades++;
                if (rupeePnl >= 0) monthlyPnL[tradeMonth].wins++;
                else monthlyPnL[tradeMonth].losses++;
                monthlyPnL[tradeMonth].pnl += rupeePnl;
            }

            completedTrades.push({
                date: activeTrade.entryDate,
                entryTime: activeTrade.entryTime,
                exitTime: c.time,
                optionType: activeTrade.optionType,
                score: activeTrade.score,
                spotEntryPrice: activeTrade.spotEntryPrice,
                spotExitPrice: exitPrice,
                rupeePnl,
                ptsPnl,
                exitReason,
                isWin: rupeePnl >= 0
            });

            activeTrade = null;
        }
    }

    const result = evaluateConsensusEngine(uniqueCandles, i, strategyConfig, data, dailyTradeCounts);

    if (result.type !== "NONE" && !activeTrade) {
        const optionType = result.type === "BUY" ? "CE" : "PE";
        const spotPrice = c.close;
        const NIFTY_LOT_SIZE = 65;
        const qty = 2 * NIFTY_LOT_SIZE; // Fixed 2 Lots (130 Qty)

        const estPremium = Math.max(80, Math.min(250, spotPrice * 0.005));

        const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
            spotPrice,
            signalType: result.type,
            stopLoss: result.stopLoss,
            targetPrice: result.targetPrice,
            riskRewardRatio: 2.0
        });

        const deltaMap = SpotRiskDeltaCalculator.mapSpotToOptionDelta({
            spotPrice,
            spotSL: spotStruct.spotSL,
            spotTarget: spotStruct.spotTarget,
            optionPremiumPrice: estPremium,
            optionType,
            delta: 0.50
        });

        activeTrade = {
            entryDate: c.date,
            entryTime: c.time,
            score: result.score,
            optionType,
            spotEntryPrice: spotPrice,
            spotSL: spotStruct.spotSL,
            spotTarget: spotStruct.spotTarget,
            optionPremiumPrice: Number(estPremium.toFixed(2)),
            optionSL: Number(deltaMap.optionSL.toFixed(2)),
            target: Number(deltaMap.optionTarget.toFixed(2)),
            quantity: qty
        };

        dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;
    }
}

console.log("\n=========================================================================================");
console.log("🏛️ HIGH CONVICTION SCORE (>= 78/100) 2026 TEST");
console.log("=========================================================================================");

const totalTrades = completedTrades.length;
const wins = completedTrades.filter(t => t.isWin).length;
const netPnL = Number((runningCapital - initialCapital).toFixed(2));
const winRate = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : 0;
const grossProfit = completedTrades.filter(t => t.rupeePnl > 0).reduce((a, b) => a + b.rupeePnl, 0);
const grossLoss = Math.abs(completedTrades.filter(t => t.rupeePnl < 0).reduce((a, b) => a + b.rupeePnl, 0));
const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.0 : 0;

console.log(`💼 Starting Capital     : ₹${initialCapital.toLocaleString()}`);
console.log(`💰 Final Ending Capital : ₹${runningCapital.toLocaleString()}`);
console.log(`💵 Net Realized PnL    : ${netPnL >= 0 ? '+' : ''}₹${netPnL.toLocaleString()} (${((netPnL/initialCapital)*100).toFixed(2)}%)`);
console.log(`📊 Total High-Score Trades: ${totalTrades}`);
console.log(`🟢 Winning Trades      : ${wins}`);
console.log(`🔴 Losing Trades       : ${totalTrades - wins}`);
console.log(`🎯 Win Rate            : ${winRate}%`);
console.log(`⚖️ Profit Factor       : ${profitFactor}`);
console.log("-----------------------------------------------------------------------------------------\n");

console.log("🗓️ MONTHLY PERFORMANCE BREAKDOWN (2026):");
console.table(Object.keys(monthlyPnL).map(m => ({
    "Month": m,
    "Trades": monthlyPnL[m].trades,
    "Wins": monthlyPnL[m].wins,
    "Losses": monthlyPnL[m].losses,
    "Win Rate (%)": monthlyPnL[m].trades > 0 ? `${((monthlyPnL[m].wins / monthlyPnL[m].trades) * 100).toFixed(1)}%` : '0%',
    "Net PnL (₹)": `${monthlyPnL[m].pnl >= 0 ? '+' : ''}₹${monthlyPnL[m].pnl.toLocaleString()}`
})));
