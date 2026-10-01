const { evaluateConsensusEngine } = require('../utility/usedfull/Engines/consensusEngine');
const reversalFilter = require('../server/reversalTest/reversal');

async function inspectLiveConsensus() {
    console.log("🔍 [INSPECT] Running evaluateConsensusEngine for current date/time...");

    const now = new Date();
    const currentDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const currentTimeStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

    const result = await evaluateConsensusEngine({
        securityId: "13",
        exchangeSegment: "IDX_I",
        interval: "5",
        date: currentDateStr,
        time: currentTimeStr
    });

    console.log("\n==========================================================================");
    console.log("📊 RESULT FROM evaluateConsensusEngine:");
    console.log("==========================================================================");
    console.log("consensus:", result.consensus);
    console.log("type:", result.type);
    console.log("entry:", result.entry);
    console.log("strategyName:", result.strategyName);
    console.log("minVotesRequired:", result.minVotesRequired);
    console.log("buyVotes:", result.buyVotes);
    console.log("sellVotes:", result.sellVotes);
    console.log("triggeredSignals:", result.triggeredSignals);
    console.log("strategyStates:", result.strategyStates);

    const lastCandle = result.lastCandle || result.evaluatedCandle;
    console.log("\nEvaluating signal in reversalFilter...");
    const confirmed = reversalFilter.evaluateSignal(result, lastCandle);
    console.log("reversalFilter.getStatus():", JSON.stringify(reversalFilter.getStatus(), null, 2));
}

inspectLiveConsensus().catch(console.error);
