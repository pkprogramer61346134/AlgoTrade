const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const strategyConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));
const data = prepareJSONStrategyData(allCandles, strategyConfig);

// Filter February 2026 candles
const febCandles = [];
const febIndexes = [];
for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (c.date && c.date.startsWith("2026-02")) {
        febCandles.push(c);
        febIndexes.push(i);
    }
}

console.log(`Loaded ${febCandles.length} candles for February 2026.\n`);

const lotSize = 65; // 1 Lot Nifty Option
let capitalStandalone10k = 10000; // Starting Capital ₹10,000 standalone for February
let capitalCompounding = 11300; // Starting Capital carried over from January 2026 (₹11,300)

let activeTrade = null;
const dailyTradeCounts = {};
const tradeLogs = [];

for (let idx = 0; idx < febIndexes.length; idx++) {
    const i = febIndexes[idx];
    const c = febCandles[idx];

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
            capitalStandalone10k += pnl;
            capitalCompounding += pnl;
            tradeLogs.push({
                date: activeTrade.date,
                time: activeTrade.time,
                type: activeTrade.type,
                entryPrice: activeTrade.entryPrice,
                stopLoss: activeTrade.stopLoss,
                targetPrice: activeTrade.targetPrice,
                pnl: pnl,
                exitReason: exitReason,
                capital10k: capitalStandalone10k,
                capitalComp: capitalCompounding,
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
console.log("📅 FEBRUARY 2026 TRADE REPORT (Trade-by-Trade Log)");
console.log("=========================================================================================================\n");

tradeLogs.forEach((t, index) => {
    console.log(`Trade #${index + 1} | ${t.date} ${t.time || ''} | ${t.type === "BUY" ? "BULLISH CE" : "BEARISH PE"} (${t.votes}/15 Votes)`);
    console.log(`   • Result                 : ${t.exitReason}`);
    console.log(`   • Option PnL             : ${t.pnl >= 0 ? '+' : ''}₹${t.pnl}`);
    console.log(`   • Balance (₹10,000 Start): ₹${t.capital10k.toLocaleString()}`);
    console.log(`   • Balance (Compounding)  : ₹${t.capitalComp.toLocaleString()}\n`);
});

console.log("=========================================================================================================");
console.log(`February 2026 Standalone Start Capital : ₹10,000.00`);
console.log(`February 2026 Standalone Final Capital : ₹${capitalStandalone10k.toLocaleString()}`);
console.log(`February 2026 Standalone Net Profit    : +₹${(capitalStandalone10k - 10000).toLocaleString()} (+${(((capitalStandalone10k - 10000) / 10000) * 100).toFixed(1)}%)`);
console.log(`February 2026 Compounding Balance End  : ₹${capitalCompounding.toLocaleString()}`);
console.log("=========================================================================================================");
