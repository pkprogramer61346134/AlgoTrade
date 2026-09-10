const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');

const candlesDir = 'C:\\candle data';
const allCandles = loadAllCandlesFromDir(candlesDir);
const sepCandles = allCandles.filter(c => c.date && c.date.startsWith('2026-09'));

const datesInSep = Array.from(new Set(sepCandles.map(c => c.date))).sort();
console.log(`September 2026 Dates:`, datesInSep);

// Group candles by date
const dateMap = new Map();
sepCandles.forEach(c => {
    if (!dateMap.has(c.date)) dateMap.set(c.date, []);
    dateMap.get(c.date).push(c);
});

console.log(`\n==================================================================`);
console.log(`🧪 TESTING VARIOUS SETUP VARIATIONS FOR SEPTEMBER 2026`);
console.log(`==================================================================\n`);

datesInSep.forEach(d => {
    const candles = dateMap.get(d) || [];
    if (candles.length < 3) return;

    // 15-min ORB High / Low (first 3 5-min candles)
    const orbHigh = Math.max(...candles.slice(0, 3).map(c => c.high));
    const orbLow = Math.min(...candles.slice(0, 3).map(c => c.low));

    // Pure Breakout Signals (Price > ORB High or < ORB Low)
    const buyBreakouts = candles.slice(3).filter(c => c.close > orbHigh);
    const sellBreakouts = candles.slice(3).filter(c => c.close < orbLow);

    console.log(`📅 Date: ${d} | 15-Min ORB High: ₹${orbHigh} | ORB Low: ₹${orbLow}`);
    if (buyBreakouts.length > 0) {
        const first = buyBreakouts[0];
        console.log(`   🚀 Pure ORB BUY Breakout at ${first.time} | Close: ₹${first.close} (High Break)`);
    } else if (sellBreakouts.length > 0) {
        const first = sellBreakouts[0];
        console.log(`   🔻 Pure ORB SELL Breakout at ${first.time} | Close: ₹${first.close} (Low Break)`);
    } else {
        console.log(`   ⚪ No ORB High/Low Breakout (Price stayed inside range ${orbLow} - ${orbHigh})`);
    }
});
