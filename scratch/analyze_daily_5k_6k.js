const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function analyze5k6kDailyTarget() {
    const hub = new CentralCandleDataHub();
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    // Test with 3 Lots (195 Qty) starting with ₹30,000 capital
    const numLots = 3; 
    const qty = numLots * 65; // 195 Qty
    const initialCapital = 30000;

    console.log("===================================================================================");
    console.log(`📊 [DAILY ₹5,000 - ₹6,000 PROFIT ANALYSIS] Fixed ${numLots} Lots (${qty} Qty)`);
    console.log(`  Capital Required: ₹30,000 | Goal: ₹5,000 - ₹6,000 per winning trade/day`);
    console.log("===================================================================================\n");

    const months = [
        { name: "January 2026", start: "2026-01-01", end: "2026-01-31" },
        { name: "February 2026", start: "2026-02-01", end: "2026-02-28" },
        { name: "March 2026", start: "2026-03-01", end: "2026-03-31" },
        { name: "April 2026", start: "2026-04-01", end: "2026-04-30" },
        { name: "May 2026", start: "2026-05-01", end: "2026-05-31" },
        { name: "June 2026", start: "2026-06-01", end: "2026-06-30" },
        { name: "July 2026", start: "2026-07-01", end: "2026-07-31" },
        { name: "August 2026", start: "2026-08-01", end: "2026-08-31" },
        { name: "September 2026", start: "2026-09-01", end: "2026-09-18" }
    ];

    let runningCapital = initialCapital;
    let winningTradePnLs = [];
    let trades5kPlus = 0;

    for (const m of months) {
        const candles = await hub.getCandlesWithWarmup(m.start, m.end, 300);
        if (!candles || candles.length < 50) continue;

        const preparedData = prepareJSONStrategyData(candles, stratConfig);
        const dailyTradeCounts = {};
        let activeTrade = null;

        for (let i = 300; i < candles.length; i++) {
            const c = candles[i];
            if (c.date < m.start || c.date > m.end) continue;

            const timeStr = c.time || '09:15';
            const parts = timeStr.split(':').map(Number);
            const totalMins = parts[0] * 60 + (parts[1] || 0);

            if (activeTrade) {
                const currentSpotPrice = c.close;
                const spotMove = currentSpotPrice - activeTrade.spotEntryPrice;
                const deltaMove = activeTrade.optionType === "CE" ? (spotMove * 0.50) : (-spotMove * 0.50);
                const currentOptionPremium = Math.max(0.5, Number((activeTrade.optionPremiumPrice + deltaMove).toFixed(2)));

                if (currentOptionPremium > activeTrade.highestPremium) {
                    activeTrade.highestPremium = currentOptionPremium;
                }

                const targetDist = activeTrade.target - activeTrade.optionPremiumPrice;
                if (targetDist > 0 && (activeTrade.highestPremium - activeTrade.optionPremiumPrice) >= (targetDist * 0.50)) {
                    if (activeTrade.currentSL < activeTrade.optionPremiumPrice) {
                        activeTrade.currentSL = activeTrade.optionPremiumPrice;
                    }
                }

                const dualExit = SpotRiskDeltaCalculator.evaluateDualLayerExit({
                    currentSpotPrice,
                    currentOptionPremium,
                    activePosition: activeTrade,
                    totalMins
                });

                if (dualExit.exitTriggered) {
                    const finalExitPremium = dualExit.exitPrice;
                    const ptsPnL = Number((finalExitPremium - activeTrade.optionPremiumPrice).toFixed(2));
                    const totalPnL = Number((ptsPnL * activeTrade.quantity).toFixed(2));

                    runningCapital = Number((runningCapital + totalPnL).toFixed(2));

                    if (totalPnL > 0) {
                        winningTradePnLs.push(totalPnL);
                        if (totalPnL >= 4500) trades5kPlus++;
                    }

                    activeTrade = null;
                }
            }

            if (!activeTrade && totalMins >= 555 && totalMins < 900) {
                const todayTrades = dailyTradeCounts[c.date] || 0;
                if (todayTrades < 3) {
                    const vwapVal = preparedData.vwap ? preparedData.vwap[i] : null;
                    const signal = evaluateConsensusEngine(candles, i, stratConfig, preparedData, dailyTradeCounts, false);

                    let vwapFilterPassed = true;
                    if (vwapVal !== null && vwapVal !== undefined) {
                        if (signal.type === "BUY" && c.close < vwapVal) vwapFilterPassed = false;
                        if (signal.type === "SELL" && c.close > vwapVal) vwapFilterPassed = false;
                    }

                    if (signal && signal.type !== "NONE" && vwapFilterPassed) {
                        const spotPrice = c.close;
                        const optionType = signal.type === "BUY" ? "CE" : "PE";
                        const optionPremiumPrice = Math.max(20, Math.round(spotPrice * 0.005));

                        const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
                            spotPrice,
                            signalType: signal.type,
                            stopLoss: signal.stopLoss,
                            targetPrice: signal.targetPrice,
                            riskRewardRatio: 2.0
                        });

                        const optionDeltaMap = SpotRiskDeltaCalculator.mapSpotToOptionDelta({
                            spotPrice,
                            spotSL: spotStruct.spotSL,
                            spotTarget: spotStruct.spotTarget,
                            optionPremiumPrice,
                            optionType,
                            maxRiskPtsCap: 100,
                            delta: 0.50
                        });

                        activeTrade = {
                            date: c.date,
                            entryTime: timeStr,
                            optionType,
                            spotEntryPrice: spotPrice,
                            spotSL: spotStruct.spotSL,
                            spotTarget: spotStruct.spotTarget,
                            quantity: qty,
                            numLots,
                            optionPremiumPrice,
                            currentPremium: optionPremiumPrice,
                            highestPremium: optionPremiumPrice,
                            initialSL: optionDeltaMap.optionSL,
                            currentSL: optionDeltaMap.optionSL,
                            target: optionDeltaMap.optionTarget,
                            currentTarget: optionDeltaMap.optionTarget
                        };
                    }
                }
            }
        }
    }

    const avgWinPnL = winningTradePnLs.length > 0 ? (winningTradePnLs.reduce((a,b)=>a+b,0)/winningTradePnLs.length) : 0;
    const maxWinPnL = winningTradePnLs.length > 0 ? Math.max(...winningTradePnLs) : 0;

    console.log(`  Initial Capital       : ₹${initialCapital.toLocaleString()}`);
    console.log(`  Trading Lot Size      : ${numLots} Lots (${qty} Qty)`);
    console.log(`  Ending Account Cap    : ₹${runningCapital.toLocaleString()} 🚀`);
    console.log(`  Total Net Realized PnL: +₹${(runningCapital - initialCapital).toLocaleString()}`);
    console.log(`  Average Winning Trade : +₹${avgWinPnL.toFixed(2)}`);
    console.log(`  Max Single Winning Trade: +₹${maxWinPnL.toFixed(2)}`);
    console.log(`  Trades with ₹4,500 - ₹10,000+ Profit: ${trades5kPlus} out of ${winningTradePnLs.length} Winning Trades`);
    console.log("===================================================================================");
}

analyze5k6kDailyTarget().catch(console.error);
