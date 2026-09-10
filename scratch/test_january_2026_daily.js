const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const strategyConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));
const data = prepareJSONStrategyData(allCandles, strategyConfig);

// Filter January 2026 candles
const janCandles = [];
const janIndexes = [];
for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (c.date && c.date.startsWith("2026-01")) {
        janCandles.push(c);
        janIndexes.push(i);
    }
}

console.log(`Loaded ${janCandles.length} candles for January 2026.\n`);

const lotSize = 65; // 1 Lot Nifty Option
let capital = 5000; // Starting Capital ₹5,000

let activeTrade = null;
const dailyTradeCounts = {};
const tradeLogs = [];

for (let idx = 0; idx < janIndexes.length; idx++) {
    const i = janIndexes[idx];
    const c = janCandles[idx];

    if (activeTrade) {
        let closed = false;
        let pnl = 0;
        let exitPrice = c.close;
        let exitReason = "";

        if (activeTrade.type === "BUY") {
            if (c.high >= activeTrade.targetPrice) {
                exitPrice = activeTrade.targetPrice;
                pnl = (activeTrade.targetPrice - activeTrade.entryPrice) * lotSize;
                closed = true;
                exitReason = "TARGET HIT 🎯";
            } else if (c.low <= activeTrade.stopLoss) {
                exitPrice = activeTrade.stopLoss;
                pnl = (activeTrade.stopLoss - activeTrade.entryPrice) * lotSize;
                closed = true;
                exitReason = "STOP LOSS HIT 🛑";
            }
        } else if (activeTrade.type === "SELL") {
            if (c.low <= activeTrade.targetPrice) {
                exitPrice = activeTrade.targetPrice;
                pnl = (activeTrade.entryPrice - activeTrade.targetPrice) * lotSize;
                closed = true;
                exitReason = "TARGET HIT 🎯";
            } else if (c.high >= activeTrade.stopLoss) {
                exitPrice = activeTrade.stopLoss;
                pnl = (activeTrade.entryPrice - activeTrade.stopLoss) * lotSize;
                closed = true;
                exitReason = "STOP LOSS HIT 🛑";
            }
        }

        if (closed) {
            capital += pnl;
            tradeLogs.push({
                entryDate: activeTrade.date,
                entryTime: activeTrade.time,
                exitDate: c.date,
                exitTime: c.time,
                type: activeTrade.type,
                entryPrice: activeTrade.entryPrice,
                stopLoss: activeTrade.stopLoss,
                targetPrice: activeTrade.targetPrice,
                exitPrice: exitPrice,
                pnl: pnl,
                exitReason: exitReason,
                capitalAfter: capital,
                votes: activeTrade.consensusVotes
            });
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
                consensusVotes: signal.consensusVotes,
                date: c.date,
                time: c.time
            };
        }
    }
}

console.log("=========================================================================================================");
console.log("📅 JANUARY 2026 PER-DAY TRADE LOG REPORT (Starting Capital: ₹5,000)");
console.log("=========================================================================================================\n");

tradeLogs.forEach((t, index) => {
    console.log(`Trade #${index + 1} | ${t.entryDate} ${t.entryTime || ''}`);
    console.log(`   • Signal     : ${t.type === "BUY" ? "BULLISH CE" : "BEARISH PE"} (${t.votes}/15 Votes)`);
    console.log(`   • Entry Spot : ₹${t.entryPrice}`);
    console.log(`   • Stop Loss  : ₹${t.stopLoss}`);
    console.log(`   • Target     : ₹${t.targetPrice} (1:3 R:R)`);
    console.log(`   • Result     : ${t.exitReason}`);
    console.log(`   • Net PnL    : ${t.pnl >= 0 ? '+' : ''}₹${t.pnl.toFixed(2)}`);
    console.log(`   • Capital    : ₹${t.capitalAfter.toFixed(2)}\n`);
});

console.log("=========================================================================================================");
console.log(`January 2026 Initial Capital : ₹5,000.00`);
console.log(`January 2026 Final Capital   : ₹${capital.toFixed(2)}`);
console.log(`January 2026 Net Profit      : +₹${(capital - 5000).toFixed(2)} (+${(((capital - 5000) / 5000) * 100).toFixed(1)}%)`);
console.log("=========================================================================================================");
