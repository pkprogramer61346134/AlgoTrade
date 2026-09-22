const fs = require('fs');
const path = require('path');
const SystemHighwayRouter = require('../src/systemHighwayRouter');

async function testHighwayRouter() {
    console.log("=== Testing SystemHighwayRouter with Master Head Engine ===");
    const highway = new SystemHighwayRouter();

    const candleFile = path.join(__dirname, '../candle_data/NIFTY_50_5_2026-09-22_2026-09-22.json');
    if (!fs.existsSync(candleFile)) {
        console.error("Candle file does not exist:", candleFile);
        return;
    }

    const candles = JSON.parse(fs.readFileSync(candleFile, 'utf8'));
    console.log(`Loaded ${candles.length} candles for 2026-09-22`);

    let signalCount = 0;
    for (let i = 0; i < candles.length; i++) {
        const result = highway.processCandleTick(candles, i);
        if (result.evalResult.type !== "NONE") {
            signalCount++;
            console.log(`\n🟢 Candle index ${i} [Time: ${candles[i].time}]:`);
            console.log(`Signal Type: ${result.evalResult.type}`);
            console.log(`Reasoning: ${result.evalResult.reasoning}`);
            console.log("MultiSignals Output:");
            console.log(JSON.stringify(result.evalResult.multiSignals, null, 2));
        }
    }

    console.log(`\nTotal signals generated via SystemHighwayRouter: ${signalCount}`);
}

testHighwayRouter().catch(console.error);
