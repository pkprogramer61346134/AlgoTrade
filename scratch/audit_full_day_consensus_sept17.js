const path = require('path');
const fs = require('fs');
const { DhanSDK } = require('../dhanAPI/index');
const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

async function auditConsensusSept17() {
    console.log("==========================================================================");
    console.log("🔍 FULL TIMELINE 16-ENGINE CONSENSUS AUDIT FOR TODAY (SEPT 17, 2026)");
    console.log("==========================================================================");
    
    const dhan = new DhanSDK();
    const todayStr = "2026-09-17";
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
        if (rootData.open && Array.isArray(rootData.open) && rootData.open.length > 0) {
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
        console.log("Error fetching today candles:", e.message);
    }

    const rawHist = loadAllCandlesFromDir('C:\\candle data') || [];
    const histCandles = rawHist.filter(c => c.date !== todayStr);

    const consensusMasterPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(consensusMasterPath, 'utf8'));

    const fullSeries = [...histCandles, ...todayCandles];
    const candleData = prepareJSONStrategyData(fullSeries, stratConfig);

    const dailyTradeCounts = {};

    const startIdx = histCandles.length;
    console.log(`Evaluating 16-Engine votes across ${todayCandles.length} candles of Sept 17...\n`);

    for (let i = startIdx; i < fullSeries.length; i++) {
        const candleIndex = i - startIdx;
        const timeStr = todayCandles[candleIndex].time;
        const evalResult = evaluateConsensusEngine(fullSeries, i, stratConfig, candleData, dailyTradeCounts);

        const buyVotes = evalResult.buyVotes || (evalResult.counts ? evalResult.counts.BUY : 0) || 0;
        const sellVotes = evalResult.sellVotes || (evalResult.counts ? evalResult.counts.SELL : 0) || 0;

        if (buyVotes >= 8 || sellVotes >= 8 || evalResult.type !== 'NONE') {
            console.log(`⏰ [${timeStr}] Spot: ₹${todayCandles[candleIndex].close} | High: ₹${todayCandles[candleIndex].high} | Buy Votes: ${buyVotes}, Sell Votes: ${sellVotes} | Signal: ${evalResult.type || 'HOLD'}`);
            if (evalResult.reasoning) {
                console.log(`   Reason: ${evalResult.reasoning}`);
            }
        }
    }
    console.log("==========================================================================");
}

auditConsensusSept17();
