/**
 * Step 6 Scratch Audit Script for Consensus Engine & Main Loop Integration
 */
const { evaluateConsensusEngine, loadStrategyConfig } = require('../utility/usedfull/Engines/consensusEngine');

async function testConsensusEngine() {
    console.log("=========================================");
    console.log("🧪 AUDIT STEP 6: Consensus Engine Verification");
    console.log("=========================================\n");

    // 1. Test Config Loading
    const cfg = loadStrategyConfig();
    console.log("1. Loaded Master Head Config:", JSON.stringify(cfg, null, 2));

    // 2. Test evaluateConsensusEngine with Auto Warmup options
    console.log("\n2. Testing evaluateConsensusEngine with auto-warmup simulation...");
    try {
        const result = await evaluateConsensusEngine({
            securityId: "13",
            exchangeSegment: "IDX_I",
            interval: "5",
            date: "2026-09-29",
            time: "15:25:00"
        });

        console.log("✅ Consensus Result Received:");
        console.log(`- Consensus Signal: ${result.consensus}`);
        console.log(`- Triggered Strategy: ${result.strategyName || 'None'}`);
        console.log(`- Evaluated Candle Time: ${result.evaluatedCandle ? `${result.evaluatedCandle.date} ${result.evaluatedCandle.time}` : 'N/A'}`);
        console.log(`- Evaluated Close Price: ₹${result.evaluatedCandle ? result.evaluatedCandle.close : 'N/A'}`);
        console.log(`- Warmup Candle Count: ${result.warmupCandleCount}`);
        console.log(`- Buy Votes: ${result.buyVotes} | Sell Votes: ${result.sellVotes}`);
        console.log(`- Min Votes Required: ${result.minVotesRequired}`);

        if (result.strategyStates && result.strategyStates.length > 0) {
            console.log("\nStrategy Details:");
            result.strategyStates.forEach(st => {
                console.log(`  * ${st.strategyName} (${st.strategyId}): Triggered=${st.triggered}, Vote=${st.vote}, Reason="${st.reason}"`);
            });
        }
    } catch (err) {
        console.error("❌ Consensus Engine Test Failed:", err);
    }
}

testConsensusEngine();
