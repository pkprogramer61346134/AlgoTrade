const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const strategyConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));
const data = prepareJSONStrategyData(allCandles, strategyConfig);

// Filter 2026 candles
const candles2026 = allCandles.filter(c => c.date && c.date.startsWith("2026"));

console.log(`Loaded ${candles2026.length} candles for Year 2026.\n`);

const months = {};
for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (c.date && c.date.startsWith("2026")) {
        const monthKey = c.date.substring(0, 7); // YYYY-MM
        if (!months[monthKey]) months[monthKey] = [];
        months[monthKey].push({ candle: c, globalIndex: i });
    }
}

const lotSize = 65; // 1 Lot Nifty Option (65 Qty)

const monthNames = {
    "2026-01": "January 2026",
    "2026-02": "February 2026",
    "2026-03": "March 2026",
    "2026-04": "April 2026",
    "2026-05": "May 2026",
    "2026-06": "June 2026",
    "2026-07": "July 2026",
    "2026-08": "August 2026",
    "2026-09": "September 2026 (YTD)"
};

console.log("=========================================================================================================");
console.log("👑 2026 PERFORMANCE REPORT FOR ₹5,000 INITIAL CAPITAL (Fixed 1 Lot / No Extra Money Added)");
console.log("=========================================================================================================\n");

let compoundingCapital = 5000; // Starting Capital ₹5,000
let lowestPoint = compoundingCapital;
let lowestDate = "";
let maxDrawdown = 0;
let peakCapital = compoundingCapital;

for (const [monthKey, itemArr] of Object.entries(months)) {
    let monthStartCap = compoundingCapital;
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
                    pnl = (activeTrade.entryPrice - activeTrade.stopLoss) * lotSize;
                    closed = true;
                }
            }

            if (closed) {
                totalTrades++;
                if (pnl > 0) winTrades++;
                else lossTrades++;
                compoundingCapital += pnl;
                totalPnl += pnl;

                if (compoundingCapital > peakCapital) {
                    peakCapital = compoundingCapital;
                }

                const currentDrawdown = peakCapital - compoundingCapital;
                if (currentDrawdown > maxDrawdown) {
                    maxDrawdown = currentDrawdown;
                }

                if (compoundingCapital < lowestPoint) {
                    lowestPoint = compoundingCapital;
                    lowestDate = `${c.date} ${c.time || ''}`;
                }

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
                    targetPrice: signal.targetPrice,
                    lots: 1
                };
            }
        }
    }

    const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(1) : "0.0";
    const retPct = (((compoundingCapital - monthStartCap) / (monthStartCap || 1)) * 100).toFixed(1);

    console.log(`📅 ${monthNames[monthKey] || monthKey}:`);
    console.log(`   • Total Trades : ${totalTrades} (Wins: ${winTrades}, Losses: ${lossTrades}) | Win Rate: ${winRate}%`);
    console.log(`   • Monthly PnL  : ${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toFixed(2)}`);
    console.log(`   • End Capital  : ₹${compoundingCapital.toFixed(2)} (${retPct >= 0 ? '+' : ''}${retPct}%)\n`);
}

console.log("=========================================================================================================");
console.log(`🏆 2026 YEAR-TO-DATE FINAL SUMMARY (₹5,000 INITIAL CAPITAL)`);
console.log("=========================================================================================================");
console.log(`Starting Capital : ₹5,000.00`);
console.log(`Final Balance    : ₹${compoundingCapital.toFixed(2)}`);
console.log(`Total Net Profit : +₹${(compoundingCapital - 5000).toFixed(2)}`);
console.log(`Total Return %   : +${(((compoundingCapital - 5000) / 5000) * 100).toFixed(1)}%`);
console.log(`Lowest Balance   : ₹${lowestPoint.toFixed(2)} on ${lowestDate}`);
console.log("=========================================================================================================");
