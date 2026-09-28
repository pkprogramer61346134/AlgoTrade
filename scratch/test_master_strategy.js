const { evaluateConsensusEngine } = require('../utility/usedfull/Engines/consensusEngine');

async function test() {
    const dummyTick = {
        date: "2026-09-28",
        time: "15:00:00",
        open: 24500,
        high: 24550,
        low: 24480,
        close: 24540,
        price: 24540,
        volume: 150000,
        securityId: "13",
        exchangeSegment: "IDX_I",
        interval: "5"
    };

    console.log("Evaluating Consensus Engine with Master Strategy...");
    const res = await evaluateConsensusEngine(dummyTick, -1, {
        securityId: "13",
        exchangeSegment: "IDX_I",
        interval: "5"
    });

    console.log("\nResult Output:");
    console.log(JSON.stringify(res, null, 2));
}

test();
