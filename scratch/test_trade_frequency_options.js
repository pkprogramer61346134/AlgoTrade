const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function testTradeFrequencyOptions() {
    const hub = new CentralCandleDataHub();
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

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

    const thresholdsToTest = [11, 12, 13, 14];

    console.log("===================================================================================");
    console.log(`📊 [TRADE FREQUENCY & WIN-RATE COMPARISON] Max 3 Trades/Day Option`);
    console.log("===================================================================================\n");

    for (const threshold of thresholdsToTest) {
        const testConfig = { ...stratConfig, consensusThreshold: threshold, maxTradesPerDay: 3 };
        
        let totalTrades = 0;
        let totalWins = 0;
        let totalLosses = 0;
        let totalBE = 0;
        let runningCapital = 10000;
        let daysWith3Trades = 0;

        for (const m of months) {
            const candles = await hub.getCandlesWithWarmup(m.start, m.end, 300);
            if (!candles || candles.length < 50) continue;

            const preparedData = prepareJSONStrategyData(candles, testConfig);
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

                        if (totalPnL > 0) totalWins++;
                        else if (totalPnL === 0) totalBE++;
                        else totalLosses++;

                        totalTrades++;
                        activeTrade = null;
                    }
                }

                if (!activeTrade && totalMins >= 555 && totalMins < 900) {
                    const todayTrades = dailyTradeCounts[c.date] || 0;
                    if (todayTrades < 3) {
                        const vwapVal = preparedData.vwap ? preparedData.vwap[i] : null;
                        const signal = evaluateConsensusEngine(candles, i, testConfig, preparedData, dailyTradeCounts, false);

                        let vwapFilterPassed = true;
                        if (vwapVal !== null && vwapVal !== undefined) {
                            if (signal.type === "BUY" && c.close < vwapVal) vwapFilterPassed = false;
                            if (signal.type === "SELL" && c.close > vwapVal) vwapFilterPassed = false;
                        }

                        if (signal && signal.type !== "NONE" && vwapFilterPassed) {
                            const spotPrice = c.close;
                            const optionType = signal.type === "BUY" ? "CE" : "PE";
                            const optionPremiumPrice = Math.max(20, Math.round(spotPrice * 0.005));

                            const numLots = Math.max(1, Math.floor(runningCapital / 10000));
                            const qty = numLots * 65;

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

            Object.values(dailyTradeCounts).forEach(cnt => {
                if (cnt >= 3) daysWith3Trades++;
            });
        }

        const avgMonthlyTrades = (totalTrades / 8.6).toFixed(1);
        const winRate = (((totalWins + totalBE) / totalTrades) * 100).toFixed(1);
        const netPnL = Number((runningCapital - 10000).toFixed(2));

        console.log(`📌 [THRESHOLD >= ${threshold}/16 YES VOTES]`);
        console.log(`  Total Trades (9 Mths): ${totalTrades} Trades (~${avgMonthlyTrades} trades/month)`);
        console.log(`  Wins / Losses / BE   : ${totalWins}W / ${totalLosses}L / ${totalBE}BE`);
        console.log(`  Win + BE Rate        : ${winRate}%`);
        console.log(`  Net Realized PnL     : +₹${netPnL.toLocaleString()} (Starting ₹10k -> ₹${runningCapital.toLocaleString()})`);
        console.log("-----------------------------------------------------------------------------------");
    }
}

testTradeFrequencyOptions().catch(console.error);
