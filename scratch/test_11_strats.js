const { evaluateConsensusEngine } = require('../head/consensusEngine');

// Create mock candle data
const mockCandles = [];
const basePrice = 23300;
for (let i = 0; i < 60; i++) {
    const timeStr = `${9 + Math.floor(i / 12)}:${(i % 12) * 5 < 10 ? '0' : ''}${(i % 12) * 5}`;
    const spot = basePrice + i * 4; // Bullish trending candles
    mockCandles.push({
        date: "2026-09-22",
        time: timeStr,
        open: spot - 2,
        high: spot + 10,
        low: spot - 3,
        close: spot + 8,
        volume: 50000 + i * 1000
    });
}

console.log(`Evaluating 11 strategies over ${mockCandles.length} test candles...`);
const signals = evaluateConsensusEngine(mockCandles, mockCandles.length - 1);
console.log(`✅ Evaluation result: ${signals.length} active signals triggered.`);
console.dir(signals, { depth: null });
