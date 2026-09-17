const path = require('path');
const fs = require('fs');
const { DhanSDK } = require('../dhanAPI/index');
const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

async function auditConsensusFullDay() {
    console.log("==========================================================================");
    console.log("🔍 FULL DAY 16-ENGINE CONSENSUS AUDIT FOR SEPT 16, 2026");
    console.log("==========================================================================");
    
    const dhan = new DhanSDK();
    const todayStr = "2026-09-16";
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

    let maxBuyVotes = 0;
    let maxSellVotes = 0;
    let totalTradeTriggers = 0;
    let triggeredCandles = [];
    const dailyTradeCounts = {};

    const startIdx = histCandles.length;
    for (let i = startIdx; i < fullSeries.length; i++) {
        const evalResult = evaluateConsensusEngine(fullSeries, i, stratConfig, candleData, dailyTradeCounts);

        const buyVotes = evalResult.buyVotes || 0;
        const sellVotes = evalResult.sellVotes || 0;

        if (buyVotes > maxBuyVotes) maxBuyVotes = buyVotes;
        if (sellVotes > maxSellVotes) maxSellVotes = sellVotes;

        if (evalResult.type && evalResult.type !== 'NONE') {
            totalTradeTriggers++;
            triggeredCandles.push({
                time: fullSeries[i].time,
                action: evalResult.type,
                buyVotes,
                sellVotes,
                close: fullSeries[i].close,
                reasoning: evalResult.reasoning
            });
        }
    }

    console.log(`- Total 5-Min Candles Evaluated Today: ${todayCandles.length}`);
    console.log(`- Peak Buy Votes Reached Today : ${maxBuyVotes} / 16 (Required Threshold: 11/16)`);
    console.log(`- Peak Sell Votes Reached Today: ${maxSellVotes} / 16 (Required Threshold: 11/16)`);
    console.log(`- Total Valid Trade Triggers  : ${totalTradeTriggers}`);

    if (triggeredCandles.length > 0) {
        console.log("\n🚀 TRADES TRIGGERED TODAY:");
        triggeredCandles.forEach(t => {
            console.log(`  👉 Time: ${t.time} | Signal: ${t.action} | Buy Votes: ${t.buyVotes}, Sell Votes: ${t.sellVotes} | Spot Close: ₹${t.close}`);
            console.log(`     Reason: ${t.reasoning}`);
        });
    } else {
        console.log("\n🔒 SYSTEM DECISION SUMMARY FOR SEPT 16, 2026:");
        console.log(`- Day Open: ₹${todayCandles[0].open}, Day High: ₹${Math.max(...todayCandles.map(c=>c.high))}, Day Low: ₹${Math.min(...todayCandles.map(c=>c.low))}, Day Close: ₹${todayCandles[todayCandles.length-1].close}`);
        console.log(`- Peak Buy Votes reached today was ${maxBuyVotes}/16 (Short of the 11/16 required threshold).`);
        console.log(`- Peak Sell Votes reached today was ${maxSellVotes}/16 (Short of the 11/16 required threshold).`);
        console.log(`- RESULT: 0 Trades Triggered today (Capital 100% Safe, 0 Losses incurred).`);
    }
    console.log("==========================================================================");
}

auditConsensusFullDay();
