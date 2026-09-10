const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const strategyConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));
const data = prepareJSONStrategyData(allCandles, strategyConfig);

const janCandles = [];
const janIndexes = [];
for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (c.date && c.date.startsWith("2026-01")) {
        janCandles.push(c);
        janIndexes.push(i);
    }
}

const lotSize = 65; // 1 Lot Nifty Option (65 Qty)
let capital5k = 5000;
let capital10k = 10000;

let activeTrade = null;
const dailyTradeCounts = {};
const tradeLogs = [];

for (let idx = 0; idx < janIndexes.length; idx++) {
    const i = janIndexes[idx];
    const c = janCandles[idx];

    if (activeTrade) {
        let closed = false;
        let pnl = 0;
        let exitReason = "";

        if (activeTrade.type === "BUY") {
            if (c.high >= activeTrade.targetPrice) {
                pnl = 3900; // Fixed Option Target Hit (60 Option Points * 65 Qty = +₹3,900)
                closed = true;
                exitReason = "TARGET HIT 🎯";
            } else if (c.low <= activeTrade.stopLoss) {
                pnl = -1300; // Fixed Option SL Hit (20 Option Points * 65 Qty = -₹1,300)
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
            capital5k += pnl;
            capital10k += pnl;
            tradeLogs.push({
                date: activeTrade.date,
                time: activeTrade.time,
                type: activeTrade.type,
                pnl: pnl,
                exitReason: exitReason,
                capital5k: capital5k,
                capital10k: capital10k
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
                date: c.date,
                time: c.time
            };
        }
    }
}

console.log("=========================================================================================================");
console.log("📅 JANUARY 2026 OPTION PREMIUM REAL-PNL LOG (1 Lot Nifty Option)");
console.log("=========================================================================================================\n");

tradeLogs.forEach((t, index) => {
    console.log(`Trade #${index + 1} | ${t.date} ${t.time || ''} | ${t.type === "BUY" ? "BULLISH CE" : "BEARISH PE"}`);
    console.log(`   • Result      : ${t.exitReason}`);
    console.log(`   • Option PnL  : ${t.pnl >= 0 ? '+' : ''}₹${t.pnl}`);
    console.log(`   • Balance (5K Start) : ₹${t.capital5k}`);
    console.log(`   • Balance (10K Start): ₹${t.capital10k}\n`);
});

console.log("=========================================================================================================");
