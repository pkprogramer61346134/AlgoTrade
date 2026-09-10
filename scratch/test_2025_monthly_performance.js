const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const strategyConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));
const data = prepareJSONStrategyData(allCandles, strategyConfig);

// Filter 2025 candles
const candles2025 = allCandles.filter(c => c.date && c.date.startsWith("2025"));

console.log(`Loaded ${candles2025.length} candles for Year 2025.\n`);

const months = {};
for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (c.date && c.date.startsWith("2025")) {
        const monthKey = c.date.substring(0, 7); // YYYY-MM
        if (!months[monthKey]) months[monthKey] = [];
        months[monthKey].push({ candle: c, globalIndex: i });
    }
}

const lotSize = 65;

const monthNames = {
    "2025-01": "January 2025",
    "2025-02": "February 2025",
    "2025-03": "March 2025",
    "2025-04": "April 2025",
    "2025-05": "May 2025",
    "2025-06": "June 2025",
    "2025-07": "July 2025",
    "2025-08": "August 2025",
    "2025-09": "September 2025",
    "2025-10": "October 2025",
    "2025-11": "November 2025",
    "2025-12": "December 2025"
};

console.log("=========================================================================================================");
console.log("👑 MASTER HEAD CONSENSUS ENGINE (15-ENGINE): 2025 MONTH-BY-MONTH BACKTEST REPORT");
console.log("=========================================================================================================\n");

let yearlyTotalPnl = 0;

for (const [monthKey, itemArr] of Object.entries(months)) {
    let capital = 10000; // ₹10,000 base starting capital per month
    let totalTrades = 0;
    let winTrades = 0;
    let lossTrades = 0;
    let totalPnl = 0;

    let activeTrade = null;
    const dailyTradeCounts = {};

    for (const item of itemArr) {
        const i = item.globalIndex;
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
                    pnl = (activeTrade.stopLoss - activeTrade.entryPrice) * lotSize;
                    closed = true;
                }
            }

            if (closed) {
                totalTrades++;
                if (pnl > 0) winTrades++;
                else lossTrades++;
                capital += pnl;
                totalPnl += pnl;
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

    const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(1) : "0.0";
    const retPct = (((capital - 10000) / 10000) * 100).toFixed(1);
    yearlyTotalPnl += totalPnl;

    console.log(`📅 ${monthNames[monthKey] || monthKey}:`);
    console.log(`   • Total Trades : ${totalTrades} (Wins: ${winTrades}, Losses: ${lossTrades}) | Win Rate: ${winRate}%`);
    console.log(`   • Monthly PnL  : ${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toFixed(2)}`);
    console.log(`   • End Balance  : ₹${capital.toFixed(2)} (${retPct >= 0 ? '+' : ''}${retPct}%)\n`);
}

console.log("=========================================================================================================");
console.log(`🏆 TOTAL 2025 YEARLY COMBINED NET PROFIT: +₹${yearlyTotalPnl.toFixed(2)}`);
console.log("=========================================================================================================");
