const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { loadAllStrategiesFromJSON } = require('../src/strategyLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');

const candlesDir = 'C:\\candle data';
const allCandles = loadAllCandlesFromDir(candlesDir);
const strategies = loadAllStrategiesFromJSON();
const stratConfig = strategies[0]; // orb_breakout_best

console.log(`Total Candles Loaded: ${allCandles.length}`);

// Get all unique dates
const dateMap = new Map();
allCandles.forEach(c => {
    if (!dateMap.has(c.date)) dateMap.set(c.date, []);
    dateMap.get(c.date).push(c);
});

const uniqueDates = Array.from(dateMap.keys());
console.log(`Total Unique Dates: ${uniqueDates.length} (from ${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]})`);

const data = prepareJSONStrategyData(allCandles, stratConfig);

let datesWithTrades = 0;
let totalTradesCount = 0;
const dateTradeCounts = {};

uniqueDates.forEach(date => {
    const candlesForDate = dateMap.get(date);
    const dailyCounts = {};
    let dateTrades = 0;

    allCandles.forEach((c, idx) => {
        if (c.date === date && idx >= 3) {
            const signal = evaluateJSONStrategy(allCandles, idx, stratConfig, data, dailyCounts);
            if (signal && signal.type !== "NONE") {
                dateTrades++;
                totalTradesCount++;
            }
        }
    });

    dateTradeCounts[date] = dateTrades;
    if (dateTrades > 0) datesWithTrades++;
});

console.log(`\n================ SUMMARY RESULTS ================`);
console.log(`Dates with at least 1 Trade Setup: ${datesWithTrades} out of ${uniqueDates.length} days (${((datesWithTrades/uniqueDates.length)*100).toFixed(1)}%)`);
console.log(`Total Signals Generated across all dataset: ${totalTradesCount}`);

// Print sample dates WITH trades and WITHOUT trades
const datesWith = uniqueDates.filter(d => dateTradeCounts[d] > 0).slice(0, 10);
const datesWithout = uniqueDates.filter(d => dateTradeCounts[d] === 0).slice(0, 10);

console.log(`\nSample Dates WITH Trades:`, datesWith);
console.log(`Sample Dates WITHOUT Trades:`, datesWithout);
