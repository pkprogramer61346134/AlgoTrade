const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const fs = require('fs');

const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const baseConfig = JSON.parse(fs.readFileSync('strategies_config/consensus_master_head.json', 'utf8'));

for (let threshold = 10; threshold <= 14; threshold++) {
    const strategyConfig = JSON.parse(JSON.stringify(baseConfig));
    strategyConfig.consensusThreshold = threshold;

    const data = prepareJSONStrategyData(allCandles, strategyConfig);

    let capital = 10000;
    const riskReward = 3.0;
    const lotSize = 65;

    let totalTrades = 0;
    let winTrades = 0;
    let lossTrades = 0;

    let activeTrade = null;
    const dailyTradeCounts = {};

    for (let i = 0; i < allCandles.length; i++) {
        const c = allCandles[i];
        
        if (activeTrade) {
            let closed = false;
            let pnl = 0;

            if (activeTrade.type === "BUY") {
                if (c.high >= activeTrade.targetPrice) {
                    pnl = (activeTrade.targetPrice - activeTrade.entryPrice) * activeTrade.lots * lotSize;
                    closed = true;
                } else if (c.low <= activeTrade.stopLoss) {
                    pnl = (activeTrade.stopLoss - activeTrade.entryPrice) * activeTrade.lots * lotSize;
                    closed = true;
                }
            } else if (activeTrade.type === "SELL") {
                if (c.low <= activeTrade.targetPrice) {
                    pnl = (activeTrade.entryPrice - activeTrade.targetPrice) * activeTrade.lots * lotSize;
                    closed = true;
                } else if (c.high >= activeTrade.stopLoss) {
                    pnl = (activeTrade.entryPrice - activeTrade.stopLoss) * activeTrade.lots * lotSize;
                    closed = true;
                }
            }

            if (closed) {
                totalTrades++;
                if (pnl > 0) winTrades++;
                else lossTrades++;
                capital += pnl;
                activeTrade = null;
            }
        }

        if (!activeTrade) {
            const signal = evaluateJSONStrategy(allCandles, i, strategyConfig, data, dailyTradeCounts);
            if (signal && signal.type !== "NONE") {
                const riskPoints = Math.abs(signal.entryPrice - signal.stopLoss);
                if (riskPoints > 0) {
                    // Option Premium Model: 1 Lot Nifty (65 qty)
                    const lots = 1;

                    activeTrade = {
                        type: signal.type,
                        entryPrice: signal.entryPrice,
                        stopLoss: signal.stopLoss,
                        targetPrice: signal.targetPrice,
                        lots: lots
                    };
                }
            }
        }
    }

    const winRate = ((winTrades / (totalTrades || 1)) * 100).toFixed(1);
    console.log(`Threshold ${threshold}/15 -> Trades: ${totalTrades}, WinRate: ${winRate}%, Final Capital: ₹${capital.toFixed(2)}`);
}
