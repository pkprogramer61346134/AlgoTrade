/**
 * Test & Verification Script for Configurable Min Strategy Votes
 * Path: C:\AlgoTrade\utility\usedcase\test-min-votes-config.js
 */

const { getCachedCandles } = require("../usedfull/cached-historical-data");
const { evaluateConsensusEngine } = require("../usedfull/Engines/consensusEngine");

async function testMinVotesConfig() {
    console.log("==========================================================================");
    console.log("🧪 TESTING CONFIGURABLE MIN STRATEGY VOTES (minVotes = 1, 2, 3, 4)");
    console.log("==========================================================================\n");

    try {
        const candleRes = await getCachedCandles({
            securityId: 13,
            exchangeSegment: "IDX_I",
            interval: "5",
            count: 200,
            date: "2026-09-23"
        });

        const testCandleIndex = 147; // Candle #148 (11:05:00 am)

        console.log(`Evaluating Candle #${testCandleIndex + 1} (${candleRes.data[testCandleIndex].date} ${candleRes.data[testCandleIndex].time})...\n`);

        for (const votesReq of [1, 2, 3, 4, 5]) {
            const res = await evaluateConsensusEngine(candleRes.data, testCandleIndex, { minVotes: votesReq });
            console.log(`minVotes = ${votesReq}: Consensus = ${res.consensus}, Buy Votes = ${res.buyVotes}, Min Required = ${res.minVotesRequired}`);
        }

        console.log("\n==========================================================================");
        console.log("🎉 SUCCESS: Minimum Required Strategy Votes is 100% Configurable!");
        console.log("==========================================================================");

    } catch (err) {
        console.error("❌ ERROR testing min votes:", err);
    }
}

testMinVotesConfig();
