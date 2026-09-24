/**
 * Auto-Warmup Test Script for Consensus Engine
 * Path: C:\AlgoTrade\utility\usedcase\test-consensus-auto-warmup.js
 */

const { evaluateConsensusEngine } = require("../usedfull/Engines/consensusEngine");

async function testAutoWarmup() {
    console.log("==========================================================================");
    console.log("🧠 TESTING AUTO-WARMUP INTEGRATION IN CONSENSUS ENGINE");
    console.log("==========================================================================\n");

    // Scenario: We pass ONLY A SINGLE CANDLE to evaluateConsensusEngine!
    const singleCandle = {
        securityId: "13",
        exchangeSegment: "IDX_I",
        interval: "5",
        date: "2026-09-23",
        time: "1:30:00 pm",
        close: 23448.05,
        open: 23440.0,
        high: 23450.0,
        low: 23438.0
    };

    console.log("1. Passing SINGLE CANDLE into evaluateConsensusEngine:");
    console.log("   Input Candle:", singleCandle);

    // Call evaluateConsensusEngine with single candle
    const result = await evaluateConsensusEngine(singleCandle, -1, { warmupCount: 200 });

    console.log("\n2. Consensus Engine Result:");
    console.log("==========================================================");
    console.log("Warmup Candles Loaded :", result.warmupCandleCount);
    console.log("Consensus / Signal    :", result.consensus);
    console.log("Entry Price           :", result.entry);
    console.log("Stop Loss (SL)        :", result.sl);
    console.log("Target (TR)           :", result.tr);
    console.log("Confidence            :", result.confidence);
    console.log("Strategy Name         :", result.strategyName);
    console.log("Triggered Signals     :", result.triggeredSignals.map(s => s.strategyId).join(", "));
    console.log("\n📊 ALL STRATEGIES STATUS (FOR UI DISPLAY):");
    console.table(result.strategyStates.map(s => ({
        ID: s.strategyId,
        Name: s.strategyName,
        Triggered: s.triggered ? "YES ✅" : "NO ❌",
        Vote: s.vote,
        Confidence: s.confidence
    })));
    console.log("==========================================================\n");

    if (result.warmupCandleCount >= 200) {
        console.log("🎉 SUCCESS: Auto-Warmup automatically fetched prior candles via cached-historical-data.js!");
    } else {
        console.error("❌ FAILED: Auto-Warmup did not load expected candles.");
    }
}

testAutoWarmup();
