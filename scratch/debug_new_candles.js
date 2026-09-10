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

const dates = Array.from(new Set(filteredCandles.map(c => c.date)));

dates.slice(0, 3).forEach(d => {
    const dayCandles = filteredCandles.filter(c => c.date === d);
    const orb = data.dayORB[d];
    console.log(`\n==================================================`);
    console.log(`Date: ${d} | ORB High: ${orb?.high} | ORB Low: ${orb?.low}`);

    dayCandles.slice(0, 10).forEach((c, i) => {
        const idx = candleIndexMap.get(`${c.date}_${c.time}`);
        const r = (data.rvol && data.rvol[idx] !== null) ? Number(data.rvol[idx]) : 1.0;
        const rsiVal = (data.rsi && data.rsi[idx] !== null) ? Number(data.rsi[idx]) : 50.0;
        const eTrend = (data.emaTrend && data.emaTrend[idx] !== null) ? Number(data.emaTrend[idx]) : null;
        console.log(`[Candle ${i+1} | ${c.time}] Close: ${c.close} | ORB High: ${orb?.high} | RVOL: ${r.toFixed(2)}x | RSI: ${rsiVal.toFixed(1)} | EMA200: ${eTrend ? eTrend.toFixed(1) : 'NULL'}`);
    });
});
