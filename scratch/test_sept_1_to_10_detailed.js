const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const strategyConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));
const data = prepareJSONStrategyData(allCandles, strategyConfig);

// Filter Sept 1, 2026 to Sept 10, 2026
const rangeCandles = [];
const rangeIndexes = [];
for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (c.date && c.date >= "2026-09-01" && c.date <= "2026-09-10") {
        rangeCandles.push(c);
        rangeIndexes.push(i);
    }
}

console.log(`Loaded ${rangeCandles.length} candles for Sept 01, 2026 to Sept 10, 2026.\n`);

const lotSize = 65; // 1 Lot Nifty Option
let capital = 10000; // Starting Capital ₹10,000

let activeTrade = null;
const dailyTradeCounts = {};
const tradeLogs = [];

for (let idx = 0; idx < rangeIndexes.length; idx++) {
    const i = rangeIndexes[idx];
    const c = rangeCandles[idx];

    if (activeTrade) {
        let closed = false;
        let pnl = 0;
        let exitReason = "";

        if (activeTrade.type === "BUY") {
            if (c.high >= activeTrade.targetPrice) {
                pnl = 3900; // Fixed Option Target Hit (+₹3,900)
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
console.log("📅 SEPT 01, 2026 TO SEPT 10, 2026 TRADE REPORT (₹10,000 STARTING CAPITAL)");
console.log("=========================================================================================================\n");

tradeLogs.forEach((t, index) => {
    console.log(`Trade #${index + 1} | ${t.date} ${t.time || ''} | ${t.type === "BUY" ? "BULLISH CE" : "BEARISH PE"} (${t.votes}/15 Votes)`);
    console.log(`   • Result     : ${t.exitReason}`);
    console.log(`   • Option PnL : ${t.pnl >= 0 ? '+' : ''}₹${t.pnl}`);
    console.log(`   • Capital    : ₹${t.capitalAfter.toLocaleString()}\n`);
});

console.log("=========================================================================================================");
console.log(`Sept 01 - Sept 10 Initial Capital : ₹10,000.00`);
console.log(`Sept 01 - Sept 10 Final Capital   : ₹${capital.toLocaleString()}`);
console.log(`Sept 01 - Sept 10 Net Profit      : +₹${(capital - 10000).toLocaleString()} (+${(((capital - 10000) / 10000) * 100).toFixed(1)}%)`);
console.log("=========================================================================================================");
