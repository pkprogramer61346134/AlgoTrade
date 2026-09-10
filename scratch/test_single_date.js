const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { loadAllStrategiesFromJSON } = require('../src/strategyLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');

function testSingleDateWithFullHistory(targetDate) {
    console.log(`==================================================================`);
    console.log(`🧪 TESTING SINGLE DATE WITH FULL HISTORY DATA: ${targetDate}`);
    console.log(`==================================================================`);

    const candlesDir = 'C:\\candle data';
    const allCandles = loadAllCandlesFromDir(candlesDir);
    const strategies = loadAllStrategiesFromJSON();
    const stratConfig = strategies[0]; // orb_breakout_best

    const data = prepareJSONStrategyData(allCandles, stratConfig);
    const candleIndexMap = new Map();
    allCandles.forEach((c, idx) => candleIndexMap.set(`${c.date}_${c.time}`, idx));

    const filteredCandles = allCandles.filter(c => c.date === targetDate);
    console.log(`Candles found for date ${targetDate}: ${filteredCandles.length}`);

    const dailyCounts = {};
    let signalCount = 0;

    filteredCandles.forEach((c) => {
        const idx = candleIndexMap.get(`${c.date}_${c.time}`);
        if (idx !== undefined && idx >= 3) {
            const signal = evaluateJSONStrategy(allCandles, idx, stratConfig, data, dailyCounts);
            if (signal && signal.type !== "NONE") {
                signalCount++;
                console.log(`🚨 [SIGNAL FOUND!] Time: ${c.time} | Type: ${signal.type} | Entry: ₹${signal.entryPrice} | SL: ₹${signal.stopLoss} | Target: ₹${signal.targetPrice}`);
                console.log(`   Reason: ${signal.reasoning}`);
            }
        }
    });

    console.log(`\nResult for ${targetDate}: Total Signals = ${signalCount}`);
    console.log(`==================================================================`);
}

// Test multiple dates across 2018, 2019, 2020, 2026!
const testDates = ['2018-01-08', '2018-01-15', '2018-02-05', '2018-08-20', '2020-03-13', '2026-09-09'];
testDates.forEach(d => testSingleDateWithFullHistory(d));
