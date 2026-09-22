const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const LiquiditySweepStrategy = require('../src/liquiditySweepStrategy');

function diagnoseTodayPE() {
    const todayFilePath = path.join(__dirname, '..', 'candle_data', 'NIFTY_50_5_2026-09-22_2026-09-22.json');
    const candles = JSON.parse(fs.readFileSync(todayFilePath, 'utf8'));
    const stratPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    let strategyConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    console.log("=========================================================================================");
    console.log("🔍 DIAGNOSTIC REPORT: WHY DID CONSENSUS ENGINE NOT TAKE PE TODAY (SEPT 22)?");
    console.log("=========================================================================================\n");

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (c.time >= "10:15" && c.time <= "11:15") {
            const data = prepareJSONStrategyData(candles.slice(0, i + 1), strategyConfig);
            const result = evaluateConsensusEngine(candles.slice(0, i + 1), i, strategyConfig, data, {});
            const zoneProt = LiquiditySweepStrategy.checkZoneProtection(candles.slice(0, i + 1), i);

            console.log(`⏰ [${c.time}] Nifty Spot: ₹${c.close} (Open: ₹${c.open}, High: ₹${c.high}, Low: ₹${c.low})`);
            console.log(`   - Raw Sell Votes : ${result.sellVotes}/10 (Required: 6/10)`);
            console.log(`   - Zone Guard PE  : ${zoneProt.blockPE ? "🚫 BLOCKED (Price near Support / Lower Wick >= 35%)" : "🟢 ALLOWED"}`);
            console.log(`   - Lower Wick %   : ${zoneProt.lowerWickPct ? zoneProt.lowerWickPct.toFixed(1) : 0}%`);
            console.log(`   - Active Engines : ${result.voteDetails.join(" | ") || "None"}`);
            console.log(`   ------------------------------------------------------------------`);
        }
    }
}

diagnoseTodayPE();
