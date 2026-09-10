const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { loadAllStrategiesFromJSON } = require('../src/strategyLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');

const candlesDir = 'C:\\candle data';
const allCandles = loadAllCandlesFromDir(candlesDir);
const strategies = loadAllStrategiesFromJSON();

console.log(`Total Candles Loaded: ${allCandles.length}`);

// Filter for September 2026 candles (2026-09-01 to 2026-09-10)
const sepCandles = allCandles.filter(c => c.date && c.date.startsWith('2026-09'));
console.log(`September 2026 Candles Count: ${sepCandles.length}`);

const datesInSep = Array.from(new Set(sepCandles.map(c => c.date))).sort();
console.log(`Dates found in September 2026:`, datesInSep);

const candleIndexMap = new Map();
allCandles.forEach((c, idx) => candleIndexMap.set(`${c.date}_${c.time}`, idx));

strategies.forEach(stratConfig => {
    console.log(`\n==================================================================`);
    console.log(`📊 EVALUATING STRATEGY: ${stratConfig.name} (${stratConfig.id})`);
    console.log(`==================================================================`);

    const data = prepareJSONStrategyData(allCandles, stratConfig);
    const dailyCounts = {};
    let sepTradeCount = 0;

    sepCandles.forEach(c => {
        const idx = candleIndexMap.get(`${c.date}_${c.time}`);
        if (idx !== undefined && idx >= 3) {
            const signal = evaluateJSONStrategy(allCandles, idx, stratConfig, data, dailyCounts);
            if (signal && signal.type !== "NONE") {
                sepTradeCount++;
                console.log(`🚨 [SIGNAL] Date: ${c.date} Time: ${c.time} | Type: ${signal.type} | Entry: ₹${signal.entryPrice} | SL: ₹${signal.stopLoss} | Target: ₹${signal.targetPrice}`);
                console.log(`   Reasoning: ${signal.reasoning}`);
            }
        }
    });

    console.log(`Total Signals for ${stratConfig.name} in Sep 2026: ${sepTradeCount}`);
});
