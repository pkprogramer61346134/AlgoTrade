const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function verifySingleDay() {
    const hub = new CentralCandleDataHub();
    const dateStr = '2026-09-15';
    
    console.log('===================================================================================');
    console.log(`🔍 [SINGLE-DAY DHAN CHART VERIFICATION AUDIT] Date: ${dateStr}`);
    console.log('===================================================================================');

    const candles = await hub.getCandlesWithWarmup(dateStr, dateStr, 300);
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    const preparedData = prepareJSONStrategyData(candles, stratConfig);
    const dayCandles = candles.filter(c => c.date === dateStr);

    console.log(`📍 Total 5-Minute Candles on ${dateStr}: ${dayCandles.length} Candles (09:15 AM to 03:25 PM)`);
    console.log('\n--- CANDLE-BY-CANDLE SIGNAL EVALUATION & VOTE BREAKDOWN ---');

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (c.date !== dateStr) continue;

        const timeStr = c.time || '09:15';
        const evalResult = evaluateConsensusEngine(candles, i, stratConfig, preparedData, {}, true);

        if (evalResult && evalResult.type !== "NONE") {
            const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
                spotPrice: c.close,
                signalType: evalResult.type,
                stopLoss: evalResult.stopLoss,
                targetPrice: evalResult.targetPrice,
                riskRewardRatio: 2.0
            });

            console.log(`\n🚨 [TRADE SIGNAL GENERATED] 🕒 Time: ${timeStr} IST`);
            console.log(`   - Signal Type      : ${evalResult.type} (BUY ${evalResult.type === 'BUY' ? 'CE' : 'PE'})`);
            console.log(`   - Nifty Spot Open  : ₹${c.open}`);
            console.log(`   - Nifty Spot High  : ₹${c.high}`);
            console.log(`   - Nifty Spot Low   : ₹${c.low}`);
            console.log(`   - Nifty Spot Close : ₹${c.close} (Entry Price)`);
            console.log(`   - Consensus Votes  : ${evalResult.consensusVotes} / 16 Sub-Engines Voted YES`);
            console.log(`   - Spot Stop Loss   : ₹${spotStruct.spotSL} (${spotStruct.spotRiskPoints} pts risk)`);
            console.log(`   - Spot Target (1:2): ₹${spotStruct.spotTarget} (${spotStruct.spotTargetPoints} pts target)`);
            
            console.log('\n   📋 16 SUB-ENGINE VOTING DETAILS:');
            evalResult.voteDetails.forEach(v => console.log(`      ✓ ${v}`));
            console.log('-----------------------------------------------------------------------------------');
        }
    }
}

verifySingleDay().catch(console.error);
