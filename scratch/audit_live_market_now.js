const path = require('path');
const fs = require('fs');

const { DhanSDK } = require('../dhanAPI/index');
const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

async function auditLiveMarketNow() {
    console.log("==========================================================================");
    console.log("📊 LIVE MARKET REAL-TIME CROSS-CHECK AUDIT (10:36 AM IST)");
    console.log("==========================================================================");

    const dhan = new DhanSDK();
    let niftySpot = 23238.05;
    let bankNiftySpot = 56161.70;

    try {
        if (dhan.marketData && typeof dhan.marketData.getMarketQuote === 'function') {
            const res = await dhan.marketData.getMarketQuote({ IDX_I: [13, 25] });
            const rootData = res?.data?.data || res?.data || res;
            const segData = rootData?.IDX_I || {};
            const sec13 = segData[13] || segData["13"] || {};
            const sec25 = segData[25] || segData["25"] || {};

            const liveNifty = sec13.last_price || sec13.lastPrice || sec13.LTP;
            const liveBank = sec25.last_price || sec25.lastPrice || sec25.LTP;

            if (liveNifty) niftySpot = Number(liveNifty);
            if (liveBank) bankNiftySpot = Number(liveBank);
            console.log(`📌 Dhan Live NIFTY 50 Spot   : ₹${niftySpot}`);
            console.log(`📌 Dhan Live BANK NIFTY Spot : ₹${bankNiftySpot}`);
        }
    } catch (e) {
        console.log(`⚠️ Dhan API Live Quote Warning: ${e.message}`);
    }

    const consensusMasterPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(consensusMasterPath, 'utf8'));

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

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
    } catch (e) {}

    const rawHist = loadAllCandlesFromDir('C:\\candle data') || [];
    const histCandles = rawHist.filter(c => c.date !== todayStr);
    let allCandles = [...histCandles, ...todayCandles];

    if (allCandles.length > 0) {
        const lastC = allCandles[allCandles.length - 1];
        if (lastC && lastC.date === todayStr) {
            lastC.close = niftySpot;
            if (niftySpot > lastC.high) lastC.high = niftySpot;
            if (niftySpot < lastC.low) lastC.low = niftySpot;
        } else {
            allCandles.push({
                date: todayStr,
                time: timeStr,
                open: niftySpot,
                high: niftySpot,
                low: niftySpot,
                close: niftySpot,
                volume: 5000
            });
        }
    }

    const data = prepareJSONStrategyData(allCandles, stratConfig);
    data.bankNiftySpot = bankNiftySpot;

    const lastIdx = allCandles.length - 1;
    const result = evaluateConsensusEngine(allCandles, lastIdx, stratConfig, data, {});

    console.log("\n--------------------------------------------------------------------------");
    console.log(`📊 TODAY'S LIVE MARKET CANDLE ANALYSIS (${todayCandles.length} Intraday Candles Synced):`);
    if (todayCandles.length > 0) {
        const firstC = todayCandles[0];
        const latestC = todayCandles[todayCandles.length - 1];
        console.log(`- Day Open Price    : ₹${firstC.open}`);
        console.log(`- Day High So Far   : ₹${Math.max(...todayCandles.map(c => c.high))}`);
        console.log(`- Day Low So Far    : ₹${Math.min(...todayCandles.map(c => c.low))}`);
        console.log(`- Current Spot Price: ₹${niftySpot}`);
    }

    console.log("\n🗳️ REAL-TIME 16-SUB-ENGINE VOTE BREAKDOWN:");
    if (result.voteDetails) {
        result.voteDetails.forEach(v => console.log(`   👉 ${v}`));
    }

    console.log("\n--------------------------------------------------------------------------");
    console.log(`🏆 SYSTEM CROSS-CHECK CONCLUSION (${timeStr}):`);
    console.log(`- Total BUY Votes  : ${result.buyVotes}`);
    console.log(`- Total SELL Votes : ${result.sellVotes}`);
    console.log(`- Required Threshold: 11 / 16`);
    console.log(`- Trade Status     : ${result.type !== "NONE" ? "🟢 " + result.type + " TRIGGERED" : "⚪ FLAT / WAITING (Market in Squeeze/Range)"}`);
    console.log(`- System Reasoning : ${result.reasoning}`);
    console.log("==========================================================================");
}

auditLiveMarketNow().catch(e => console.error("Audit error:", e));
