const { candleDataHub } = require('../src/candleDataHub');

async function testWarmupFetch() {
    console.log("=== Testing Central Candle Data Hub Warmup Data Fetching ===");
    const candles = await candleDataHub.getCandlesWithWarmup('2026-09-01', '2026-09-01', 300);

    console.log(`Total candles returned for 2026-09-01 (including 300 warmup candles): ${candles.length}`);
    if (candles.length > 0) {
        console.log(`First candle in dataset: ${candles[0].date} ${candles[0].time}`);
        console.log(`Target date first candle: ${candles.find(c => c.date === '2026-09-01')?.date} ${candles.find(c => c.date === '2026-09-01')?.time}`);
        const targetIndex = candles.findIndex(c => c.date === '2026-09-01');
        console.log(`Warmup candles preceding 2026-09-01: ${targetIndex} candles`);
    }
}

testWarmupFetch().catch(err => console.error(err));
