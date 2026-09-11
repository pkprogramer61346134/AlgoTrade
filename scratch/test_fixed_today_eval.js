const path = require('path');
const fs = require('fs');

const { DhanSDK } = require('../dhanAPI/index');
const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

async function testFixedTodayEval() {
    console.log("==========================================================================");
    console.log("🛠️ TESTING REAL INTRADAY CANDLE SYNC FOR TODAY (SEPT 11)");
    console.log("==========================================================================");

    const dhan = new DhanSDK();
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    // 1. Load historical candles
    const allCandles = loadAllCandlesFromDir('C:\\candle data') || [];
    const histCandles = allCandles.filter(c => c.date !== todayStr);

    // 2. Fetch today's real 5-min candles from Dhan API
    let todayCandles = [];
    try {
        const res = await dhan.marketData.getIntradayData({
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "5",
            fromDate: todayStr,
            toDate: todayStr
        });
        const rootData = res?.data?.data || res?.data || res;
        if (rootData.open && Array.isArray(rootData.open)) {
            for (let i = 0; i < rootData.open.length; i++) {
                const ts = rootData.timestamp[i];
                const dateObj = new Date(ts * 1000);
                const tStr = dateObj.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
                todayCandles.push({
                    date: todayStr,
                    time: tStr,
                    timestamp: ts,
                    open: rootData.open[i],
                    high: rootData.high[i],
                    low: rootData.low[i],
                    close: rootData.close[i],
                    volume: rootData.volume ? rootData.volume[i] : 5000
                });
            }
        }
    } catch (e) {
        console.error("Dhan API fetch error:", e.message);
    }

    console.log(`Historical candles: ${histCandles.length}`);
    console.log(`Today's real Dhan candles: ${todayCandles.length}`);

    const combinedCandles = [...histCandles, ...todayCandles];

    const consensusMasterPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(consensusMasterPath, 'utf8'));

    const data = prepareJSONStrategyData(combinedCandles, stratConfig);
    data.bankNiftySpot = 56190.50;
    data.bankNiftyPrevClose = 56471.95;
    data.bankNiftyOpen = 55970.15;
    data.bankNiftyNetChange = -281.45;

    const lastIdx = combinedCandles.length - 1;
    const result = evaluateConsensusEngine(combinedCandles, lastIdx, stratConfig, data, {});

    console.log("\n--------------------------------------------------------------------------");
    const orb = data.dayORB[todayStr] || {};
    console.log(`📊 ACCURATE TODAY ORB METRICS:`);
    console.log(`- Today Real ORB High (9:15-9:30 AM) : ₹${orb.high}`);
    console.log(`- Today Real ORB Low (9:15-9:30 AM)  : ₹${orb.low}`);
    console.log(`- Last Candle Price [${combinedCandles[lastIdx]?.time}] : ₹${combinedCandles[lastIdx]?.close}`);
    console.log("--------------------------------------------------------------------------");

    console.log("\n🏆 REAL CONSENSUS EVALUATION VERDICT:");
    console.log(`- Signal Output : ${result.type || 'FLAT / WAITING'}`);
    console.log(`- Buy Votes     : ${result.buyVotes}`);
    console.log(`- Sell Votes    : ${result.sellVotes}`);
    console.log(`- Reasoning     : ${result.reasoning}`);
    console.log("==========================================================================");
}

testFixedTodayEval();
