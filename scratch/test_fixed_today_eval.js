const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { evaluateSingleConsensusSignal } = require('../head/consensusEngine');

const candles = loadAllCandlesFromDir();
console.log(`Loaded ${candles.length} total candles.`);

const todayCandles = candles.filter(c => c.date === '2026-09-23');
console.log(`Today's candles count: ${todayCandles.length}`);

for (let i = Math.max(0, candles.length - 15); i < candles.length; i++) {
    const c = candles[i];
    const res = evaluateSingleConsensusSignal(candles, i);
    console.log(`[${c.date} ${c.time}] Spot: ₹${c.close} | Consensus: ${res.consensus} | Strat Buy: ${res.stratBuyCount} | Strat Sell: ${res.stratSellCount}`);
    if (res.allSignals && res.allSignals.length > 0) {
        console.log(`   Triggered Signals:`, res.allSignals.map(s => s.strategyName));
    }
}
