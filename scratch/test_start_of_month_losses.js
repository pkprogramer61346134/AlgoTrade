const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const strategyConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));
const data = prepareJSONStrategyData(allCandles, strategyConfig);

const monthsData = {};

for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (!c.date) continue;
    const monthKey = c.date.substring(0, 7); // YYYY-MM
    if (!monthsData[monthKey]) monthsData[monthKey] = [];
    monthsData[monthKey].push({ candle: c, index: i });
}

console.log("Analyzing Month-Start Recovery under 15-Engine Consensus Strategy...\n");

const lotSize = 65;
let startWithLossCount = 0;
let recoveredMonthCount = 0;

for (const [month, candleList] of Object.entries(monthsData)) {
    let capital = 10000;
    let activeTrade = null;
    const dailyTradeCounts = {};
    const monthTrades = [];

    for (const item of candleList) {
        const i = item.index;
        const c = item.candle;

        if (activeTrade) {
            let closed = false;
            let pnl = 0;

            if (activeTrade.type === "BUY") {
                if (c.high >= activeTrade.targetPrice) {
                    pnl = (activeTrade.targetPrice - activeTrade.entryPrice) * lotSize;
                    closed = true;
                } else if (c.low <= activeTrade.stopLoss) {
                    pnl = (activeTrade.stopLoss - activeTrade.entryPrice) * lotSize;
                    closed = true;
                }
            } else if (activeTrade.type === "SELL") {
                if (c.low <= activeTrade.targetPrice) {
                    pnl = (activeTrade.entryPrice - activeTrade.targetPrice) * lotSize;
                    closed = true;
                } else if (c.high >= activeTrade.stopLoss) {
                    pnl = (activeTrade.entryPrice - activeTrade.stopLoss) * lotSize;
                    closed = true;
                }
            }

            if (closed) {
                capital += pnl;
                monthTrades.push({ pnl, capitalAfter: capital });
                activeTrade = null;
            }
        }

        if (!activeTrade) {
            const signal = evaluateJSONStrategy(allCandles, i, strategyConfig, data, dailyTradeCounts);
            if (signal && signal.type !== "NONE") {
                activeTrade = {
                    type: signal.type,
                    entryPrice: signal.entryPrice,
                    stopLoss: signal.stopLoss,
                    targetPrice: signal.targetPrice
                };
            }
        }
    }

    if (monthTrades.length > 0) {
        const firstTrade = monthTrades[0];
        if (firstTrade.pnl < 0) {
            startWithLossCount++;
            const finalCap = monthTrades[monthTrades.length - 1].capitalAfter;
            const isProfitable = finalCap > 10000;
            if (isProfitable) recoveredMonthCount++;
            console.log(`Month ${month}: First Trade Loss (${firstTrade.pnl}) | Final Capital: ₹${finalCap.toFixed(2)} | Recovered: ${isProfitable ? "YES ✅" : "NO ❌"}`);
        }
    }
}

console.log(`\nMonths starting with a loss: ${startWithLossCount}`);
console.log(`Months fully recovered into profit: ${recoveredMonthCount} (${((recoveredMonthCount/startWithLossCount)*100).toFixed(1)}%)`);
