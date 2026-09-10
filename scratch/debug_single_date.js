const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { loadAllStrategiesFromJSON } = require('../src/strategyLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');

const candlesDir = 'C:\\candle data';
const allCandles = loadAllCandlesFromDir(candlesDir);
const strategies = loadAllStrategiesFromJSON();
const stratConfig = strategies[0]; // orb_breakout_best

const data = prepareJSONStrategyData(allCandles, stratConfig);
const candleIndexMap = new Map();
allCandles.forEach((c, idx) => candleIndexMap.set(`${c.date}_${c.time}`, idx));

const targetDate = '2026-08-20';
const filteredCandles = allCandles.filter(c => c.date === targetDate);

filteredCandles.slice(0, 15).forEach((c, i) => {
    const idx = candleIndexMap.get(`${c.date}_${c.time}`);
    const orb = data.dayORB[c.date];
    const r = (data.rvol && data.rvol[idx] !== null) ? Number(data.rvol[idx]) : 1.0;
    const rsiVal = (data.rsi && data.rsi[idx] !== null) ? Number(data.rsi[idx]) : 50.0;
    console.log(`[${i+1} | ${c.time}] Close: ₹${c.close} | ORB High: ₹${orb?.high} | Low: ₹${orb?.low} | RVOL: ${r.toFixed(2)}x | RSI: ${rsiVal.toFixed(1)}`);
});
