const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const strategyConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));
const data = prepareJSONStrategyData(allCandles, strategyConfig);

// Filter September 2026 candles
const sepCandles = [];
const sepIndexes = [];
for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (c.date && c.date.startsWith("2026-09")) {
        sepCandles.push(c);
        sepIndexes.push(i);
    }
}

console.log(`Loaded ${sepCandles.length} candles for September 2026 (Sept 1 to Sept 10).\n`);

const lotSize = 65; // 1 Lot Nifty Option
let capital = 10000; // Starting Capital ₹10,000 for September

let activeTrade = null;
const dailyTradeCounts = {};
const tradeLogs = [];

for (let idx = 0; idx < sepIndexes.length; idx++) {
    const i = sepIndexes[idx];
    const c = sepCandles[idx];

    if (activeTrade) {
        let closed = false;
        let pnl = 0;
        let exitReason = "";

        if (activeTrade.type === "BUY") {
            if (c.high >= activeTrade.targetPrice) {
                pnl = 3900; // Fixed Option Target Hit (1:3 R:R = +₹3,900)
                closed = true;
                exitReason = "TARGET HIT 🎯";
            } else if (c.low <= activeTrade.stopLoss) {
                pnl = -1300; // Fixed Option SL Hit (-₹1,300)
                closed = true;
                exitReason = "STOP LOSS HIT 🛑";
            }
        } else if (activeTrade.type === "SELL") {
            if (c.low <= activeTrade.targetPrice) {
                pnl = 3900; // Fixed Option Target Hit
                closed = true;
                exitReason = "TARGET HIT 🎯";
            } else if (c.high >= activeTrade.stopLoss) {
                pnl = -1300; // Fixed Option SL Hit
                closed = true;
                exitReason = "STOP LOSS HIT 🛑";
            }
        }

        if (closed) {
            capital += pnl;
            tradeLogs.push({
                date: activeTrade.date,
                time: activeTrade.time,
                type: activeTrade.type,
                entryPrice: activeTrade.entryPrice,
                stopLoss: activeTrade.stopLoss,
                targetPrice: activeTrade.targetPrice,
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
console.log("📅 SEPTEMBER 2026 (SEPT 1 TO SEPT 10) TRADE REPORT (₹10,000 Starting Capital)");
console.log("=========================================================================================================\n");

tradeLogs.forEach((t, index) => {
    console.log(`Trade #${index + 1} | ${t.date} ${t.time || ''} | ${t.type === "BUY" ? "BULLISH CE" : "BEARISH PE"} (${t.votes}/15 Votes)`);
    console.log(`   • Result     : ${t.exitReason}`);
    console.log(`   • Option PnL : ${t.pnl >= 0 ? '+' : ''}₹${t.pnl}`);
    console.log(`   • Capital    : ₹${t.capitalAfter.toLocaleString()}\n`);
});

console.log("=========================================================================================================");
console.log(`September 2026 (Till Sept 10) Initial Capital : ₹10,000.00`);
console.log(`September 2026 (Till Sept 10) Final Capital   : ₹${capital.toLocaleString()}`);
console.log(`September 2026 (Till Sept 10) Net Profit      : +₹${(capital - 10000).toLocaleString()} (+${(((capital - 10000) / 10000) * 100).toFixed(1)}%)`);
console.log("=========================================================================================================");
