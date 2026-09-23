const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { computeIndicators, evaluateConsensusEngine } = require('../head/consensusEngine');

const allCandles = loadAllCandlesFromDir();
console.log(`Loaded ${allCandles.length} total candles from disk.`);

// Create mock today candles up to 10:50
const todayTimes = [
    { time: '09:15', open: 23330, high: 23350, low: 23315, close: 23320 },
    { time: '09:20', open: 23320, high: 23330, low: 23310, close: 23318 },
    { time: '09:25', open: 23318, high: 23360, low: 23315, close: 23355 },
    { time: '09:30', open: 23355, high: 23410, low: 23350, close: 23405 },
    { time: '09:35', open: 23405, high: 23415, low: 23380, close: 23390 },
    { time: '09:40', open: 23390, high: 23400, low: 23370, close: 23375 },
    { time: '09:45', open: 23375, high: 23390, low: 23360, close: 23365 },
    { time: '09:50', open: 23365, high: 23375, low: 23350, close: 23355 },
    { time: '09:55', open: 23355, high: 23600, low: 23335, close: 23340 },
    { time: '10:00', open: 23340, high: 23400, low: 23340, close: 23395 },
    { time: '10:05', open: 23395, high: 23410, low: 23370, close: 23400 },
    { time: '10:10', open: 23400, high: 23405, low: 23365, close: 23370 },
    { time: '10:15', open: 23370, high: 23380, low: 23360, close: 23375 },
    { time: '10:20', open: 23375, high: 23385, low: 23365, close: 23378 },
    { time: '10:25', open: 23378, high: 23390, low: 23370, close: 23380 },
    { time: '10:30', open: 23380, high: 23395, low: 23375, close: 23392 },
    { time: '10:35', open: 23392, high: 23405, low: 23388, close: 23402 },
    { time: '10:40', open: 23402, high: 23412, low: 23395, close: 23408 },
    { time: '10:45', open: 23408, high: 23416, low: 23402, close: 23414 },
    { time: '10:50', open: 23414, high: 23420, low: 23410, close: 23419.15 }
];

const todayCandles = todayTimes.map((t, idx) => ({
    symbol: 'NIFTY_50',
    date: '2026-09-23',
    time: t.time,
    timestamp: 1790100000 + idx * 300,
    open: t.open,
    high: t.high,
    low: t.low,
    close: t.close,
    volume: 50000
}));

// Filter out 2026-09-23 from allCandles and append todayCandles
const priorCandles = allCandles.filter(c => c.date !== '2026-09-23');
const mergedCandles = [...priorCandles, ...todayCandles];

console.log(`Merged candles total count: ${mergedCandles.length}`);

const idx1050 = mergedCandles.length - 1;
const computed = computeIndicators(mergedCandles, {});
console.log(`\n=== INDICATORS AT 10:50 WITH 774+ WARMUP CANDLES ===`);
console.log(`Spot: ${mergedCandles[idx1050].close}`);
console.log(`VWAP: ${computed.vwap[idx1050]}`);
console.log(`Supertrend:`, computed.supertrend[idx1050]);
console.log(`RVOL: ${computed.rvol[idx1050]}`);
console.log(`RSI: ${computed.rsi[idx1050]}`);
console.log(`ADX:`, computed.adx ? computed.adx[idx1050] : 'N/A');
console.log(`EMA 10: ${computed.ema10 ? computed.ema10[idx1050] : 'N/A'}`);
console.log(`EMA 20: ${computed.emaFast ? computed.emaFast[idx1050] : 'N/A'}`);
console.log(`EMA 50: ${computed.emaSlow ? computed.emaSlow[idx1050] : 'N/A'}`);

const evalRes = evaluateConsensusEngine(mergedCandles, idx1050);
console.log(`\n=== CONSENSUS EVALUATION RESULT AT 10:50 ===`);
console.log(`Triggered Signals Count:`, evalRes.triggeredSignals.length);
if (evalRes.triggeredSignals.length > 0) {
    console.log(`Signals:`, evalRes.triggeredSignals);
} else {
    console.log(`Strategy States:`, evalRes.strategyStates);
}
