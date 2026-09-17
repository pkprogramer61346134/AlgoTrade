const path = require('path');
const fs = require('fs');
const { DhanSDK } = require('../dhanAPI/index');
const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

async function simulateFullDaySept17() {
    console.log("==========================================================================");
    console.log("💰 FULL DAY SIMULATION: SEPT 17, 2026 (IF TOKEN WAS ACTIVE FROM 9:15 AM)");
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
    const fullSeries = [...histCandles, ...todayCandles];

    const consensusMasterPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(consensusMasterPath, 'utf8'));
    const candleData = prepareJSONStrategyData(fullSeries, stratConfig);

    let balance = 10455; // Balance at start of Sept 17
    let activePosition = null;
    let tradesExecuted = [];
    const dailyTradeCounts = {};

    // Start evaluation at 9:30 AM (histCandles.length + 3)
    const startIdx = histCandles.length + 3;

    for (let i = startIdx; i < fullSeries.length; i++) {
        const currentCandle = fullSeries[i];
        const spotPrice = currentCandle.close;
        const timeStr = currentCandle.time;

        if (activePosition) {
            const spotMove = spotPrice - activePosition.spotEntryPrice;
            const deltaMove = activePosition.optionType === "CE" ? (spotMove * 0.50) : (-spotMove * 0.50);
            const livePremium = Math.max(0.5, Number((activePosition.optionPremiumPrice + deltaMove).toFixed(2)));

            let exitTriggered = false;
            let exitReason = "";
            let exitPrice = livePremium;

            // Check T1 -> T2 Trailing SL
            if (!activePosition.t1Reached && livePremium >= activePosition.target1) {
                activePosition.t1Reached = true;
                const t1ProfitPts = activePosition.target1 - activePosition.optionPremiumPrice;
                const lockedSL = Number((activePosition.optionPremiumPrice + (t1ProfitPts * 0.75)).toFixed(2));
                activePosition.currentSL = Math.max(activePosition.currentSL, lockedSL);
                activePosition.currentTarget = activePosition.target2;
            }

            if (activePosition.t1Reached && livePremium >= activePosition.target2) {
                exitTriggered = true;
                exitReason = "TARGET_2_HIT";
                exitPrice = activePosition.target2;
            } else if (livePremium <= activePosition.currentSL) {
                exitTriggered = true;
                exitReason = activePosition.t1Reached ? "TRAILED_SL_HIT" : "INITIAL_SL_HIT";
                exitPrice = activePosition.currentSL;
            } else if (i === fullSeries.length - 1) { // EOD Market Close
                exitTriggered = true;
                exitReason = "EOD_MARKET_CLOSE";
                exitPrice = livePremium;
            }

            if (exitTriggered) {
                const ptsPnL = Number((exitPrice - activePosition.optionPremiumPrice).toFixed(2));
                const pnl = Number((ptsPnL * activePosition.quantity).toFixed(2));
                balance += pnl;

                tradesExecuted.push({
                    tradeNo: tradesExecuted.length + 1,
                    entryTime: activePosition.entryTime,
                    exitTime: timeStr,
                    type: activePosition.optionType,
                    entrySpot: activePosition.spotEntryPrice,
                    exitSpot: spotPrice,
                    entryPremium: activePosition.optionPremiumPrice,
                    exitPremium: exitPrice,
                    ptsPnL,
                    pnl,
                    exitReason,
                    result: pnl > 0 ? (activePosition.t1Reached ? "T1_TRAILED_WIN / T2_WIN" : "WIN") : "LOSS",
                    balanceAfter: balance
                });

                activePosition = null; // Unlock 2-way handshake
            }
        } else {
            // No active position -> Scan 16-Engine Consensus
            const evalResult = evaluateConsensusEngine(fullSeries, i, stratConfig, candleData, dailyTradeCounts);
            if (evalResult.type && evalResult.type !== 'NONE') {
                const optionType = evalResult.type === 'BUY' ? 'CE' : 'PE';
                const approxPremium = 110.0;
                const target1 = approxPremium + 60.0;
                const target2 = approxPremium + 90.0;
                const initialSL = approxPremium - 20.0;

                activePosition = {
                    entryTime: timeStr,
                    optionType,
                    spotEntryPrice: spotPrice,
                    optionPremiumPrice: approxPremium,
                    initialSL,
                    currentSL: initialSL,
                    target1,
                    target2,
                    currentTarget: target1,
                    t1Reached: false,
                    quantity: 65
                };
            }
        }
    }

    console.log(`- Total Trades Executed in Simulation : ${tradesExecuted.length}`);
    console.log(`- Starting Balance (Before Sept 17)    : ₹10,455`);
    console.log(`- Ending Balance (After Sept 17)      : ₹${balance.toFixed(2)}`);
    console.log(`- Total Net PnL For Today            : ${balance - 10455 >= 0 ? '+' : ''}₹${(balance - 10455).toFixed(2)}\n`);

    tradesExecuted.forEach(t => {
        console.log(`👉 Trade #${t.tradeNo} [${t.type}]: Entry @ ${t.entryTime} (Spot ₹${t.entrySpot}, Prem ₹${t.entryPremium}) ➔ Exit @ ${t.exitTime} (Spot ₹${t.exitSpot}, Prem ₹${t.exitPremium})`);
        console.log(`   Result: ${t.result} | Reason: ${t.exitReason} | PnL: ${t.pnl >= 0 ? '+' : ''}₹${t.pnl} (${t.ptsPnL >= 0 ? '+' : ''}${t.ptsPnL} pts) | Balance After: ₹${t.balanceAfter.toFixed(2)}\n`);
    });

    console.log("==========================================================================");
}

simulateFullDaySept17();
