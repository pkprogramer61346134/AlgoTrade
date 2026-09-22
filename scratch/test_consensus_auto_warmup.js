const { evaluateSingleConsensusSignal } = require('../head/consensusEngine');
const { loadAllCandlesFromDir, getCandleDataDir } = require('../indicators/utils/dataLoader');

async function testAutoWarmupFeature() {
    console.log('===========================================================');
    console.log('🧪 TESTING: ConsensusEngine Automatic Warmup Candle Sourcing');
    console.log('===========================================================\n');

    const allCandles = loadAllCandlesFromDir(getCandleDataDir());
    if (allCandles.length < 300) {
        console.warn('⚠️ Less than 300 candles in local cache, test using available dataset.');
    }

    // Pass ONLY 10 candles from the middle of the dataset (intentionally incomplete warmup!)
    const incompleteCandles = allCandles.slice(100, 110);
    console.log(`📦 Client provided ONLY ${incompleteCandles.length} candles starting from date: ${incompleteCandles[0].date} ${incompleteCandles[0].time}`);

    console.log('\n🧠 Calling evaluateSingleConsensusSignal(incompleteCandles)...');
    const signalResult = evaluateSingleConsensusSignal(incompleteCandles);

    console.log('\n📊 Evaluation Result:');
    console.log(JSON.stringify(signalResult, null, 2));

    console.log('\n===========================================================');
    console.log('✅ AUTOMATIC WARMUP CANDLE SOURCING TEST COMPLETED SUCCESSFULLY!');
    console.log('===========================================================');

    process.exit(0);
}

testAutoWarmupFeature();
