const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

console.log(`Loaded ${allCandles.length} candles.`);

const strategyConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));
const data = prepareJSONStrategyData(allCandles, strategyConfig);

let capital = 10000; // Starting Capital ₹10,000
const riskReward = 3.0; // 1:3.0 Target R:R
const lotSize = 65; // 2026 Nifty Option Lot Size

let totalTrades = 0;
let winTrades = 0;
let lossTrades = 0;
let totalProfitLoss = 0;

let activeTrade = null;
const dailyTradeCounts = {};

for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    
    // Position exit evaluation
    if (activeTrade) {
        let closed = false;
        let pnl = 0;
        let exitPrice = c.close;
        let exitReason = "";

        if (activeTrade.type === "BUY") {
            if (c.high >= activeTrade.targetPrice) {
                exitPrice = activeTrade.targetPrice;
                pnl = (activeTrade.targetPrice - activeTrade.entryPrice) * activeTrade.lots * lotSize;
                closed = true;
                exitReason = "TARGET HIT 🎯";
            } else if (c.low <= activeTrade.stopLoss) {
                exitPrice = activeTrade.stopLoss;
                pnl = (activeTrade.stopLoss - activeTrade.entryPrice) * activeTrade.lots * lotSize;
                closed = true;
                exitReason = "STOP LOSS HIT 🛑";
            }
        } else if (activeTrade.type === "SELL") {
            if (c.low <= activeTrade.targetPrice) {
                exitPrice = activeTrade.targetPrice;
                pnl = (activeTrade.entryPrice - activeTrade.targetPrice) * activeTrade.lots * lotSize;
                closed = true;
                exitReason = "TARGET HIT 🎯";
            } else if (c.high >= activeTrade.stopLoss) {
                exitPrice = activeTrade.stopLoss;
                pnl = (activeTrade.entryPrice - activeTrade.stopLoss) * activeTrade.lots * lotSize;
                closed = true;
                exitReason = "STOP LOSS HIT 🛑";
            }
        }

        if (closed) {
            totalTrades++;
            if (pnl > 0) winTrades++;
            else lossTrades++;
            capital += pnl;
            totalProfitLoss += pnl;
            activeTrade = null;
        }
    }

    // Signal evaluation
    if (!activeTrade) {
        const signal = evaluateJSONStrategy(allCandles, i, strategyConfig, data, dailyTradeCounts);
        if (signal && signal.type !== "NONE") {
            const riskPoints = Math.abs(signal.entryPrice - signal.stopLoss);
            if (riskPoints > 0) {
                const maxRiskMoney = capital * 0.02; // 2% risk per trade
                const riskPerLot = riskPoints * lotSize;
                const lots = Math.max(1, Math.floor(maxRiskMoney / riskPerLot));

                activeTrade = {
                    type: signal.type,
                    entryPrice: signal.entryPrice,
                    stopLoss: signal.stopLoss,
                    targetPrice: signal.targetPrice,
                    lots: lots,
                    date: c.date,
                    time: c.time
                };
            }
        }
    }
}

console.log("\n=========================================================================================");
console.log(`👑 15-ENGINE MASTER HEAD CONSENSUS 8-YEAR BACKTEST RESULTS`);
console.log("=========================================================================================");
console.log(`Initial Capital: ₹10,000`);
console.log(`Final Capital  : ₹${capital.toFixed(2)}`);
console.log(`Total Return   : +${(((capital - 10000) / 10000) * 100).toFixed(2)}%`);
console.log(`Total Trades   : ${totalTrades}`);
console.log(`Win Trades     : ${winTrades} (${((winTrades / (totalTrades || 1)) * 100).toFixed(1)}%)`);
console.log(`Loss Trades    : ${lossTrades} (${((lossTrades / (totalTrades || 1)) * 100).toFixed(1)}%)`);
console.log(`Total PnL      : ₹${totalProfitLoss.toFixed(2)}`);
console.log("=========================================================================================\n");
