const path = require('path');
const fs = require('fs');

const { loadAllCandlesFromDir, getCandleDataDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');

function parseTimeToMins(tStr) {
    if (!tStr) return 0;
    let clean = tStr.toLowerCase().trim();
    let isPM = clean.includes('pm');
    let isAM = clean.includes('am');
    clean = clean.replace('am', '').replace('pm', '').trim();
    const parts = clean.split(':').map(Number);
    let hrs = parts[0] || 0;
    let mins = parts[1] || 0;
    if (isPM && hrs < 12) hrs += 12;
    if (isAM && hrs === 12) hrs = 0;
    return hrs * 60 + mins;
}

async function testProtectedBacktest() {
    console.log("==========================================================================");
    console.log("🧪 TESTING SEPT 17 BACKTEST WITH 9:30 AM ORB RANGE PROTECTION");
    console.log("==========================================================================");

    const candleDir = getCandleDataDir();
    const allCandles = loadAllCandlesFromDir(candleDir);
    const sept17Candles = allCandles.filter(c => c.date === '2026-09-17');

    const masterPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
    const data = prepareJSONStrategyData(allCandles, stratConfig);

    const candleIndexMap = new Map();
    allCandles.forEach((c, idx) => candleIndexMap.set(`${c.date}_${c.time}`, idx));

    const signals = [];
    sept17Candles.forEach(c => {
        const idx = candleIndexMap.get(`${c.date}_${c.time}`);
        const mins = parseTimeToMins(c.time);
        if (mins >= 570) { // 9:30 AM onwards
            const sig = evaluateJSONStrategy(allCandles, idx, stratConfig, data, {});
            if (sig && sig.type !== "NONE") {
                signals.push({ time: c.time, spot: c.close, sig });
            }
        }
    });

    console.log(`Found ${signals.length} valid breakouts at or after 9:30 AM on Sept 17:`);
    signals.forEach(s => {
        console.log(`  👉 ${s.time}: Type=${s.sig.type}, Spot=₹${s.spot}`);
    });
    console.log("==========================================================================");
}

testProtectedBacktest();
