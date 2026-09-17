const path = require('path');
const fs = require('fs');

const { loadAllCandlesFromDir, getCandleDataDir } = require('../indicators/utils/dataLoader');
const { loadAllStrategiesFromJSON } = require('../src/strategyLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');

async function testSept17Backtest() {
    console.log("==========================================================================");
    console.log("🧪 TESTING BACKTEST ENGINE FOR TODAY (SEPT 17, 2026)");
    console.log("==========================================================================");

    const candleDir = getCandleDataDir();
    const allCandles = loadAllCandlesFromDir(candleDir);
    console.log(`Loaded ${allCandles.length} candles from disk (${candleDir}).`);

    const sept17Candles = allCandles.filter(c => c.date === '2026-09-17');
    console.log(`Found ${sept17Candles.length} candles for date 2026-09-17.`);

    const masterPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(masterPath, 'utf8'));

    const data = prepareJSONStrategyData(allCandles, stratConfig);
    const candleIndexMap = new Map();
    allCandles.forEach((c, idx) => candleIndexMap.set(`${c.date}_${c.time}`, idx));

    const trades = [];
    let activeTrade = null;

    sept17Candles.forEach(c => {
        const idx = candleIndexMap.get(`${c.date}_${c.time}`);
        if (idx === undefined || idx < 2) return;

        if (activeTrade) {
            let closed = false;
            let isWin = false;

            if (c.time === '3:25:00 pm' || c.time === '3:15:00 pm') {
                closed = true;
                isWin = activeTrade.type === "BUY" ? (c.close > activeTrade.entryPrice) : (c.close < activeTrade.entryPrice);
            } else if (activeTrade.type === "BUY") {
                if (c.high >= activeTrade.targetPrice) {
                    isWin = true;
                    closed = true;
                } else if (c.low <= activeTrade.stopLoss) {
                    isWin = false;
                    closed = true;
                }
            } else if (activeTrade.type === "SELL") {
                if (c.low <= activeTrade.targetPrice) {
                    isWin = true;
                    closed = true;
                } else if (c.high >= activeTrade.stopLoss) {
                    isWin = false;
                    closed = true;
                }
            }

            if (closed) {
                trades.push({
                    ...activeTrade,
                    exitTime: c.time,
                    exitPrice: c.close,
                    result: isWin ? "WIN" : "LOSS"
                });
                activeTrade = null;
            }
        }

        if (!activeTrade && c.time !== '3:25:00 pm') {
            const signal = evaluateJSONStrategy(allCandles, idx, stratConfig, data, {});
            if (signal && signal.type !== "NONE") {
                console.log(`🎯 SIGNAL TRIGGERED AT ${c.time}: Type=${signal.type}, Spot=₹${signal.entryPrice}, Reason=${signal.reasoning}`);
                activeTrade = {
                    date: c.date,
                    time: c.time,
                    type: signal.type,
                    entryPrice: signal.entryPrice,
                    stopLoss: signal.stopLoss,
                    targetPrice: signal.targetPrice
                };
            }
        }
    });

    console.log("\n==========================================================================");
    console.log(`📊 TOTAL BACKTEST TRADES FOR SEPT 17: ${trades.length}`);
    trades.forEach(t => {
        console.log(`  👉 Entry: ${t.time} (${t.type} @ ₹${t.entryPrice}) | Exit: ${t.exitTime} | Result: ${t.result}`);
    });
    console.log("==========================================================================");
}

testSept17Backtest();
