const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const strategyConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));
const data = prepareJSONStrategyData(allCandles, strategyConfig);

const months = {};
for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (c.date && c.date.startsWith("2026")) {
        const monthKey = c.date.substring(0, 7);
        if (!months[monthKey]) months[monthKey] = [];
        months[monthKey].push({ candle: c, globalIndex: i });
    }
}

const lotSize = 65;

for (const [monthKey, itemArr] of Object.entries(months)) {
    let capital = 10000;
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

    console.log(`${monthKey}: Trades=${totalTrades}, PnL=₹${totalPnl.toFixed(2)}, EndCap=₹${capital.toFixed(2)}`);
}
