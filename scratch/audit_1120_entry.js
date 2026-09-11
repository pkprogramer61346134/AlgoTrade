const path = require('path');
const fs = require('fs');

const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

function audit1120Entry() {
    console.log("==========================================================================");
    console.log("🔍 DEEP AUDIT OF 11:20:55 AM ENTRY (SPOT ₹23,336.15)");
    console.log("==========================================================================");

    const consensusMasterPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(consensusMasterPath, 'utf8'));

    const allCandles = loadAllCandlesFromDir('C:\\candle data') || [];
    const todayStr = '2026-09-11';
    const timeStr = '11:20:55 am';
    const spot = 23336.15;
    const bankSpot = 56165.50;

    if (allCandles.length > 0) {
        const lastC = allCandles[allCandles.length - 1];
        if (lastC && lastC.date === todayStr) {
            lastC.close = spot;
            if (spot > lastC.high) lastC.high = spot;
            if (spot < lastC.low) lastC.low = spot;
        } else {
            allCandles.push({
                date: todayStr,
                time: timeStr,
                open: spot,
                high: spot,
                low: spot,
                close: spot,
                volume: 5000
            });
        }
    }

    const data = prepareJSONStrategyData(allCandles, stratConfig);
    data.bankNiftySpot = bankSpot;
    data.bankNiftyPrevClose = 56471.95;
    data.bankNiftyOpen = 55970.15;
    data.bankNiftyNetChange = -306.45;

    const lastIdx = allCandles.length - 1;
    const result = evaluateConsensusEngine(allCandles, lastIdx, stratConfig, data, {});

    console.log(`- NIFTY Spot Tested : ₹${spot}`);
    console.log(`- BANK NIFTY Tested : ₹${bankSpot} (Net Change: ${data.bankNiftyNetChange} pts)`);
    console.log(`- Evaluated Signal  : ${result.type}`);
    console.log(`- Total BUY Votes   : ${result.buyVotes}`);
    console.log(`- Total SELL Votes  : ${result.sellVotes}`);
    console.log(`- Required Threshold: 11 / 16`);
    console.log("\n🗳️ ALL 16 SUB-ENGINES INDIVIDUAL VOTES AT 11:20:55 AM:");
    if (result.voteDetails) {
        result.voteDetails.forEach(v => console.log(`   👉 ${v}`));
    }

    console.log("\n--------------------------------------------------------------------------");
    if (result.sellVotes >= 11 || result.buyVotes >= 11) {
        console.log(`✅ VERDICT: ENTRY IS 100% VALID & LEGITIMATE!`);
        console.log(`   At 11:20:55 am, ${result.sellVotes >= 11 ? result.sellVotes : result.buyVotes} out of 16 engines confirmed consensus!`);
    } else {
        console.log(`⚠️ VERDICT: ENTRY DID NOT MEET 11/16 THRESHOLD! (Sell Votes: ${result.sellVotes}, Buy Votes: ${result.buyVotes})`);
    }
    console.log("==========================================================================");
}

audit1120Entry();
