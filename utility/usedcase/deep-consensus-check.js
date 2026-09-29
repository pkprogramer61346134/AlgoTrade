const { evaluateConsensusEngine, computeIndicators, loadStrategyConfig } = require("../usedfull/Engines/consensusEngine");

async function deepCrossCheckConsensusEngine() {
    console.log("==========================================================================");
    console.log("🔍 DEEP CROSS-CHECK: STRATEGY CONSENSUS ENGINE & AUTO-WARMUP TEST");
    console.log("==========================================================================");

    const targetDate = "2026-09-29";
    const targetTime = "11:25:00";
    const securityId = "13";
    const exchangeSegment = "IDX_I";
    const interval = "5";

    console.log(`📡 Calling evaluateConsensusEngine([], -1, { date: "${targetDate}", time: "${targetTime}", interval: "${interval}" })...\n`);

    const result = await evaluateConsensusEngine([], -1, {
        securityId,
        exchangeSegment,
        interval,
        date: targetDate,
        time: targetTime
    });

    console.log("==========================================================================");
    console.log("📊 1. WARMUP CANDLE DATA VERIFICATION");
    console.log("==========================================================================");
    console.log(`Total Warmup Candles Fetched: ${result.warmupCandleCount}`);
    
    if (result.lastCandle) {
        console.log(`Latest Candle Timestamp    : ${result.lastCandle.date} ${result.lastCandle.time}`);
        console.log(`Latest Candle Prices       : Open ₹${result.lastCandle.open} | High ₹${result.lastCandle.high} | Low ₹${result.lastCandle.low} | Close ₹${result.lastCandle.close}`);
    } else {
        console.error("❌ ERROR: No candle data found!");
    }

    console.log("\n==========================================================================");
    console.log("🧠 2. FINAL CONSOLIDATED CONSENSUS SIGNAL OUTPUT");
    console.log("==========================================================================");
    console.log(`Final Consensus Signal : ${result.consensus}`);
    console.log(`Signal Type            : ${result.type || 'N/A'}`);
    console.log(`Entry Price            : ₹${result.entry || 0}`);
    console.log(`Stop Loss (SL)         : ₹${result.sl || 0}`);
    console.log(`Take Profit (TP/TR)    : ₹${result.tr || 0}`);
    console.log(`Signal Confidence      : ${result.confidence || '0%'}`);
    console.log(`Triggered Strategy     : ${result.strategyName || 'None'}`);

    console.log("\n==========================================================================");
    console.log("📋 3. STRATEGY VOTES BREAKDOWN");
    console.log("==========================================================================");
    if (Array.isArray(result.strategyStates) && result.strategyStates.length > 0) {
        console.table(result.strategyStates.map(s => ({
            "Strategy Name": s.strategyName,
            "Triggered": s.triggered ? "✅ YES" : "❌ NO",
            "Vote": s.vote,
            "Reason / Filter Output": s.reason
        })));
    } else {
        console.log("No strategy states found.");
    }

    console.log("\n✅ DEEP CROSS-CHECK COMPLETED SUCCESSFULLY.");
}

deepCrossCheckConsensusEngine().catch(err => console.error("❌ Cross-check failed:", err));
