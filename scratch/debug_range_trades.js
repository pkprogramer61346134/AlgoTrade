const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { loadAllStrategiesFromJSON } = require('../src/strategyLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');

const candlesDir = 'C:\\candle data';
const allCandles = loadAllCandlesFromDir(candlesDir);
const strategies = loadAllStrategiesFromJSON();
const stratConfig = strategies[0]; // orb_breakout_best

const startDate = '2026-08-01';
const endDate = '2026-09-09';
const filteredCandles = allCandles.filter(c => c.date >= startDate && c.date <= endDate);

const data = prepareJSONStrategyData(allCandles, stratConfig);
const candleIndexMap = new Map();
allCandles.forEach((c, idx) => candleIndexMap.set(`${c.date}_${c.time}`, idx));

// Check unique dates in filtered range
const dates = Array.from(new Set(filteredCandles.map(c => c.date)));
console.log(`Unique dates in range: ${dates.length}`);

// Sample 5 dates
dates.slice(0, 5).forEach(d => {
    const dayCandles = filteredCandles.filter(c => c.date === d);
    const orb = data.dayORB[d];
    console.log(`\nDate: ${d} | ORB High: ${orb?.high} | ORB Low: ${orb?.low}`);
    dayCandles.slice(3, 10).forEach(c => {
        const idx = candleIndexMap.get(`${c.date}_${c.time}`);
        const r = (data.rvol && data.rvol[idx] !== null) ? Number(data.rvol[idx]) : 1.0;
        const rsiVal = (data.rsi && data.rsi[idx] !== null) ? Number(data.rsi[idx]) : 50.0;
        console.log(`  [${c.time}] Close: ${c.close} | RVOL: ${r.toFixed(2)}x | RSI: ${rsiVal.toFixed(1)}`);
    });
});
