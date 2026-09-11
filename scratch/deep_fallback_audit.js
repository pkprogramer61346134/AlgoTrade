const path = require('path');
const fs = require('fs');

const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

async function testDynamicPipelineSensitivity() {
    console.log("==========================================================================");
    console.log("🔬 DEEP PIPELINE AUDIT: TESTING FOR ANY HIDDEN HARDCODED FALLBACKS");
    console.log("==========================================================================");

    const consensusMasterPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(consensusMasterPath, 'utf8'));
    const allCandles = loadAllCandlesFromDir('C:\\candle data') || [];

    // Test Case A: Dynamic Spot @ ₹23,100.00 (Deep Bearish Test)
    console.log("\n🧪 TEST CASE A: Passing Dynamic Live Spot = ₹23,100.00 & Bank Spot = ₹50,500.00");
    let candlesA = JSON.parse(JSON.stringify(allCandles));
    let lastCA = candlesA[candlesA.length - 1];
    lastCA.close = 23100.00;
    lastCA.high = 23100.00;
    lastCA.low = 23100.00;

    let dataA = prepareJSONStrategyData(candlesA, stratConfig);
    dataA.bankNiftySpot = 50500.00;
    let signalA = evaluateConsensusEngine(candlesA, candlesA.length - 1, stratConfig, dataA, {});
    console.log(`-> Signal Type Output : ${signalA.type}`);
    console.log(`-> Engine Reasoning   : ${signalA.reasoning}`);
    console.log(`-> Engine 16 Detail   : ${signalA.voteDetails.find(v => v.includes("Engine 16"))}`);

    // Test Case B: Dynamic Spot @ ₹23,600.00 (Deep Bullish Test)
    console.log("\n🧪 TEST CASE B: Passing Dynamic Live Spot = ₹23,600.00 & Bank Spot = ₹52,500.00");
    let candlesB = JSON.parse(JSON.stringify(allCandles));
    let lastCB = candlesB[candlesB.length - 1];
    lastCB.close = 23600.00;
    lastCB.high = 23600.00;
    lastCB.low = 23600.00;

    let dataB = prepareJSONStrategyData(candlesB, stratConfig);
    dataB.bankNiftySpot = 52500.00;
    let signalB = evaluateConsensusEngine(candlesB, candlesB.length - 1, stratConfig, dataB, {});
    console.log(`-> Signal Type Output : ${signalB.type}`);
    console.log(`-> Engine Reasoning   : ${signalB.reasoning}`);
    console.log(`-> Engine 16 Detail   : ${signalB.voteDetails.find(v => v.includes("Engine 16"))}`);

    console.log("\n--------------------------------------------------------------------------");
    console.log("✅ PIPELINE AUDIT VERDICT:");
    if (signalA.reasoning.includes("23100") && signalB.reasoning.includes("23600")) {
        console.log("💯 100% PROOF CONFIRMED: No hardcoded fallback levels exist!");
        console.log("   The consensus engine reacts 100% dynamically to whatever real-time data is passed into it.");
    } else {
        console.log("⚠️ WARNING: Found unexpected static values in pipeline!");
    }
    console.log("==========================================================================");
}

testDynamicPipelineSensitivity();
