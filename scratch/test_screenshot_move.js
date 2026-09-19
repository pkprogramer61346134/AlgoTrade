const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function checkScreenshotMove() {
    console.log('===================================================================================');
    console.log('🔍 [SCREENSHOT CHART MOVE AUDIT] Date: 18-Sep-2026 Breakout (13:30 to 15:00 IST)');
    console.log('===================================================================================');

    const hub = new CentralCandleDataHub();
    const dateStr = '2026-09-18';
    const candles = await hub.getCandlesWithWarmup(dateStr, dateStr, 300);

    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));
    const preparedData = prepareJSONStrategyData(candles, stratConfig);

    const targetCandles = candles.filter(c => c.date === dateStr);
    console.log(`📍 Analyzing ${targetCandles.length} candles for 18-Sep-2026...\n`);

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (c.date !== dateStr) continue;

        const timeStr = c.time || '09:15';
        const parts = timeStr.split(':').map(Number);
        const mins = parts[0] * 60 + (parts[1] || 0);

        // Focus on the 13:30 to 15:00 breakout move shown in screenshot
        if (mins >= 810 && mins <= 900) {
            const evalResult = evaluateConsensusEngine(candles, i, stratConfig, preparedData, {}, true);

            console.log(`🕒 Candle [${timeStr}] | Open: ₹${c.open} | High: ₹${c.high} | Low: ₹${c.low} | Close: ₹${c.close} | Vol: ${c.volume}`);
            console.log(`   - Consensus Votes: Buy Votes = ${evalResult.buyVotes}, Sell Votes = ${evalResult.sellVotes} (Threshold: 13/16)`);
            console.log(`   - Signal Result: ${evalResult.type} (${evalResult.reasoning.substring(0, 80)}...)`);
            console.log('-----------------------------------------------------------------------------------');
        }
    }
}

checkScreenshotMove().catch(console.error);
