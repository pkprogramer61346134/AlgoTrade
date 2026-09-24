/**
 * Test & Verification Script for Clean Consensus Engine
 * Path: C:\AlgoTrade\utility\usedcase\test-consensus-engine.js
 */

const { getCachedCandles } = require("../usedfull/cached-historical-data");
const { evaluateConsensusEngine } = require("../usedfull/Engines/consensusEngine");

async function testConsensusEngine() {
    console.log("========================================================================");
    console.log("🧠 TESTING CLEAN CONSENSUS ENGINE (Input -> Output Strategy Evaluator)");
    console.log("========================================================================\n");

    try {
        // Step 1: Load past 200 candles from cached historical data up to 2026-09-23
        console.log("1. Fetching latest 200 candles up to 2026-09-23...");
        const candleRes = await getCachedCandles({
            securityId: 13,
            exchangeSegment: "IDX_I",
            interval: "5",
            count: 200,
            date: "2026-09-23"
        });

        console.log(`✅ Loaded ${candleRes.data.length} candles from disk cache.`);

        // Step 2: Loop through candles and evaluate signals
        console.log("\n2. Evaluating Consensus Engine across all candles to find signals...");
        let signalsFound = 0;

        for (let i = 0; i < candleRes.data.length; i++) {
            const result = await evaluateConsensusEngine(candleRes.data, i);

            if (result.consensus !== "NO_SIGNAL") {
                signalsFound++;
                console.log(`\n🎯 [SIGNAL DETECTED at Candle #${i + 1}] Date: ${candleRes.data[i].date} Time: ${candleRes.data[i].time}`);
                console.log("--------------------------------------------------");
                console.log("Consensus / Type :", result.consensus);
                console.log("Entry Price      :", result.entry);
                console.log("Stop Loss (SL)   :", result.sl);
                console.log("Target (TR)      :", result.tr);
                console.log("Confidence       :", result.confidence);
                console.log("Strategy ID      :", result.strategyId);
                console.log("Strategy Name    :", result.strategyName);
                console.log("Triggered Signals:", result.triggeredSignals.map(s => `${s.strategyId} (${s.type})`).join(", "));
                console.log("--------------------------------------------------");
            }
        }

        console.log(`\n✅ Evaluation Complete. Total Consensus Signals Triggered: ${signalsFound}`);

    } catch (err) {
        console.error("❌ ERROR testing consensus engine:", err.message);
    }
}

testConsensusEngine();
