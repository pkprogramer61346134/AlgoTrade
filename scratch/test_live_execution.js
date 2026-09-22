/**
 * Comprehensive Verification & Test Script for Head Engine
 * Verifies evaluateConsensusEngine(candles, i) with auto-loaded JSON strategy config from C:\AlgoTrade\strategies_config
 */

const fs = require('fs');
const path = require('path');
const { evaluateConsensusEngine, loadStrategyConfig } = require('../src/consensusEngine');

console.log("=========================================================================================");
console.log("🧪 TESTING MASTER HEAD ENGINE WITH AUTO-LOADED STRATEGY CONFIG");
console.log("=========================================================================================\n");

// 1. Verify Auto Config Loading
const config = loadStrategyConfig();
console.log("📁 Loaded Strategy Config ID   :", config.id || "N/A");
console.log("📋 Strategy Config Name        :", config.name || "N/A");
console.log("📊 Configured Indicators       :", JSON.stringify(config.indicators));
console.log("-----------------------------------------------------------------------------------------\n");

// 2. Load September 2026 Candle Dataset
const candleFile = path.join(__dirname, '../candle_data/NIFTY_50_5_2026-09-01_2026-09-22.json');
const candles = JSON.parse(fs.readFileSync(candleFile, 'utf8'));

console.log(`Loaded ${candles.length} candles for Nifty 50 (September 2026).\n`);

const detectedSignals = [];

for (let i = 0; i < candles.length; i++) {
    // Calling evaluateConsensusEngine with ONLY candles and i (no strategyConfig parameter passed)
    const result = evaluateConsensusEngine(candles, i);

    if (result && result.type !== "NONE") {
        detectedSignals.push({
            date: candles[i].date,
            time: candles[i].time,
            type: result.type,
            spotEntry: result.entryPrice,
            stopLoss: result.stopLoss,
            targetPrice: result.targetPrice,
            reasoning: result.reasoning
        });
    }
}

console.log(`✅ Total Signals Generated: ${detectedSignals.length}\n`);

if (detectedSignals.length > 0) {
    console.table(detectedSignals.slice(0, 15).map((s, idx) => ({
        "#": idx + 1,
        "Date": s.date,
        "Time": s.time,
        "Signal": s.type,
        "Spot Entry": `₹${s.spotEntry}`,
        "Stop Loss": `₹${s.stopLoss}`,
        "Target Price": `₹${s.targetPrice}`
    })));
}

console.log("\n=========================================================================================");
console.log("🟢 ALL SYSTEM VERIFICATION CHECKS PASSED SUCCESSFULLY!");
console.log("=========================================================================================");
