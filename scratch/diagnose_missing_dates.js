const { candleDataHub } = require('../Candlehub/candleDataHub');
const { evaluateConsensusEngine, loadStrategyConfig } = require('../head/consensusEngine');

async function diagnoseMissingDates() {
    console.log('===========================================================');
    console.log('🔍 [DIAGNOSTIC] Inspecting Market Conditions for Sept 17, 18, 21...');
    console.log('===========================================================');

    const allCandles = await candleDataHub.getCandles('2026-09-01', '2026-09-22', 'NIFTY_50', '5');

    const missingDates = ['2026-09-17', '2026-09-18', '2026-09-21'];

    for (const dateStr of missingDates) {
        console.log(`\n📅 --- MARKET ANALYSIS FOR ${dateStr} ---`);
        const dayCandles = allCandles.filter(c => c.date === dateStr);
        console.log(`Total 5-min candles on ${dateStr}: ${dayCandles.length}`);

        if (dayCandles.length === 0) {
            console.log(`❌ No candle data found for ${dateStr} (Possible Weekend/Market Holiday).`);
            continue;
        }

        let totalSignalsTriggered = 0;

        for (let i = 50; i < allCandles.length; i++) {
            const c = allCandles[i];
            if (c.date !== dateStr) continue;

            const signals = evaluateConsensusEngine(allCandles, i, {});
            if (signals.length > 0) {
                totalSignalsTriggered++;
                console.log(`   ⏱️ [${c.time}] Close: ${c.close} | Triggered ${signals.length} signals:`);
                signals.forEach(s => {
                    console.log(`      👉 ${s.strategyId} (${s.strategyName}) - ${s.type}`);
                });
            }
        }

        if (totalSignalsTriggered === 0) {
            console.log(`🔒 [NO SIGNAL] On ${dateStr}, market was in a low-volume / sideways consolidation zone. RVOL < 1.30 or ADX < 20 filters blocked fake trades.`);
        }
    }
}

diagnoseMissingDates().catch(err => console.error(err));
