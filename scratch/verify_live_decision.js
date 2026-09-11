const path = require('path');
const fs = require('fs');

const { DhanSDK } = require('../dhanAPI/index');
const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

async function main() {
    console.log("==========================================================================");
    console.log("🔍 REAL-TIME DHAN API & 16-ENGINE CONSENSUS LIVE AUDIT & COMPARISON");
    console.log("==========================================================================");

    const dhan = new DhanSDK();
    let spot = 23296.45;
    let bankSpot = 51200.00;

    try {
        if (dhan.marketData && typeof dhan.marketData.getMarketQuote === 'function') {
            const res = await dhan.marketData.getMarketQuote({ IDX_I: [13, 25] });
            const rootData = res?.data?.data || res?.data || res;
            const segData = rootData?.IDX_I || {};
            const sec13 = segData[13] || segData["13"] || {};
            const sec25 = segData[25] || segData["25"] || {};

            const liveLtp = sec13.last_price || sec13.lastPrice || sec13.LTP;
            const bankLtp = sec25.last_price || sec25.lastPrice || sec25.LTP;

            if (liveLtp) {
                spot = Number(liveLtp);
                console.log(`✅ Live Dhan API NIFTY 50 Spot Price Fetched: ₹${spot}`);
            }
            if (bankLtp) {
                bankSpot = Number(bankLtp);
                console.log(`✅ Live Dhan API BANK NIFTY Spot Price Fetched: ₹${bankSpot}`);
            }
        }
    } catch (e) {
        console.log(`⚠️ Dhan API Call Error: ${e.message}. Using current reported spot: ₹${spot}`);
    }

    const consensusMasterPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(consensusMasterPath, 'utf8'));

    const allCandles = loadAllCandlesFromDir('C:\\candle data') || [];
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

    if (allCandles.length > 0) {
        const lastC = allCandles[allCandles.length - 1];
        if (lastC && lastC.date === todayStr) {
            lastC.close = spot;
            if (spot > lastC.high) lastC.high = spot;
            if (spot < lastC.low) lastC.low = spot;
        } else {
            allCandles.push({
                date: todayStr,
                time: timeStr,
                open: spot,
                high: spot,
                low: spot,
                close: spot,
                volume: 5000
            });
        }
    }

    const data = prepareJSONStrategyData(allCandles, stratConfig);
    data.bankNiftySpot = bankSpot;

    const lastIdx = allCandles.length - 1;
    const result = evaluateConsensusEngine(allCandles, lastIdx, stratConfig, data, {});

    console.log("\n--------------------------------------------------------------------------");
    console.log(`📊 LIVE MARKET METRICS AT ${timeStr}:`);
    console.log(`- NIFTY 50 Spot Price    : ₹${spot}`);
    console.log(`- BANK NIFTY Spot Price  : ₹${bankSpot}`);
    const orb = data.dayORB[todayStr] || { high: 'N/A', low: 'N/A' };
    console.log(`- Today ORB High         : ₹${orb.high}`);
    console.log(`- Today ORB Low          : ₹${orb.low}`);
    console.log(`- RSI (14)               : ${data.rsi && data.rsi[lastIdx] ? data.rsi[lastIdx].toFixed(2) : 'N/A'}`);
    console.log(`- EMA 50                 : ${data.emaTrend && data.emaTrend[lastIdx] ? data.emaTrend[lastIdx].toFixed(2) : 'N/A'}`);
    console.log(`- ATR (14)               : ${data.atr && data.atr[lastIdx] ? data.atr[lastIdx].toFixed(2) : 'N/A'}`);
    console.log(`- Relative Vol (RVOL)    : ${data.rvol && data.rvol[lastIdx] ? data.rvol[lastIdx].toFixed(2) : '1.0'}`);
    console.log("--------------------------------------------------------------------------");

    console.log("\n🗳️ 16 SUB-ENGINES VOTE BREAKDOWN:");
    if (result.voteDetails) {
        result.voteDetails.forEach(v => console.log(`   👉 ${v}`));
    }

    console.log("\n--------------------------------------------------------------------------");
    console.log(`🏆 CONSENSUS EVALUATION DECISION:`);
    console.log(`- Total BUY Votes  : ${result.buyVotes}`);
    console.log(`- Total SELL Votes : ${result.sellVotes}`);
    console.log(`- Required Threshold: 11 / 16`);
    console.log(`- Signal Output    : ${result.type || 'FLAT / WAITING'}`);
    console.log(`- Engine Reasoning : ${result.reasoning}`);
    console.log("==========================================================================");
}

main();
