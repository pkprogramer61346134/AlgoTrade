const fs = require('fs');
const path = require('path');
const { evaluateConsensusEngine } = require('../head/consensusEngine');

console.log("=== Testing head/consensusEngine.js with candleDataHub Warmup ===");

const candleFile = path.join(__dirname, '../candle_data/NIFTY_50_5_2026-09-22_2026-09-22.json');
const todayCandles = JSON.parse(fs.readFileSync(candleFile, 'utf8'));

console.log(`Loaded ${todayCandles.length} candles for today (2026-09-22)`);

// Test passing ONLY today's candles (testing candleDataHub auto-warmup)
console.log("\nTesting evaluateConsensusEngine passing ONLY current day's candles (auto-warmup via candleDataHub)...");

let signalCount = 0;
for (let i = 0; i < todayCandles.length; i++) {
    const signals = evaluateConsensusEngine(todayCandles, i);
    if (Array.isArray(signals) && signals.length > 0) {
        signalCount++;
        console.log(`\n🟢 [Time: ${todayCandles[i].time}] TRIGGERED ${signals.length} STRATEGIES ARRAY:`);
        console.log(JSON.stringify(signals, null, 2));
    }
}

console.log(`\n✅ Total signals generated with auto-warmup: ${signalCount}`);
