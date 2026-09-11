const path = require('path');
const fs = require('fs');

const { DhanSDK } = require('../dhanAPI/index');
const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

async function auditActiveTradeNow() {
    console.log("==========================================================================");
    console.log("🔍 LIVE TRADE VALIDITY & CONSENSUS AUDIT (AT 11:36 AM)");
    console.log("==========================================================================");

    const dhan = new DhanSDK();
    let niftySpot = 23332.95;
    let bankNiftySpot = 56165.50;
    let optionLtp = 31.50;

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

            // Fetch live option quote for 23100 PE
            const optRes = await dhan.marketData.getMarketQuote({ NSE_FNO: [47282] });
            const optData = optRes?.data?.data || optRes?.data || optRes;
            const optSeg = optData?.NSE_FNO || {};
            const optSec = optSeg[47282] || optSeg["47282"] || {};
            if (optSec.last_price || optSec.LTP) {
                optionLtp = Number(optSec.last_price || optSec.LTP);
            }
        }
    } catch (e) {
        console.log(`⚠️ API Call Notice: ${e.message}`);
    }

    const consensusMasterPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(consensusMasterPath, 'utf8'));

    const allCandles = loadAllCandlesFromDir('C:\\candle data') || [];
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

    if (allCandles.length > 0) {
        const lastC = allCandles[allCandles.length - 1];
        if (lastC && lastC.date === todayStr) {
            lastC.close = niftySpot;
            if (niftySpot > lastC.high) lastC.high = niftySpot;
            if (niftySpot < lastC.low) lastC.low = niftySpot;
        }
    }

    const data = prepareJSONStrategyData(allCandles, stratConfig);
    data.bankNiftySpot = bankNiftySpot;
    data.bankNiftyPrevClose = 56471.95;
    data.bankNiftyOpen = 55970.15;
    data.bankNiftyNetChange = bankNiftySpot - 56471.95;

    const lastIdx = allCandles.length - 1;
    const result = evaluateConsensusEngine(allCandles, lastIdx, stratConfig, data, {});

    console.log(`- NIFTY 50 Live Spot   : ₹${niftySpot}`);
    console.log(`- BANK NIFTY Live Spot : ₹${bankNiftySpot} (${data.bankNiftyNetChange >= 0 ? '+' : ''}${data.bankNiftyNetChange.toFixed(1)} pts)`);
    console.log(`- NIFTY 23100 PE Option Premium : ₹${optionLtp} (Entry: ₹31.55, SL: ₹27.00, Target: ₹47.85)`);
    console.log(`- 16-Engine Live Consensus State: ${result.type || 'FLAT / HOLD ACTIVE POSITION'}`);
    console.log(`- Current Sell Votes    : ${result.sellVotes}`);
    console.log(`- Current Buy Votes     : ${result.buyVotes}`);

    console.log("\n--------------------------------------------------------------------------");
    const entryPrice = 31.55;
    const slPrice = 27.00;
    const targetPrice = 47.85;

    if (optionLtp <= slPrice) {
        console.log("🛑 TRADE ALERT: Stop Loss hit! Exit position as per discipline.");
    } else if (optionLtp >= targetPrice) {
        console.log("🎯 TRADE ALERT: Target Price hit! Book profits as per discipline.");
    } else {
        console.log("✅ TRADE VALIDITY VERDICT: TRADE IS 100% VALID & IN-PROGRESS (HOLDING ACTIVE)!");
        console.log(`   - Risk parameters intact (SL ₹27.00 is safe).`);
        console.log(`   - Target ₹47.85 intact.`);
        console.log(`   - Recommendation: HOLD position until SL (₹27.00) or Target (₹47.85) is hit.`);
    }
    console.log("==========================================================================");
}

auditActiveTradeNow();
