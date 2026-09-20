const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function test11amTo3pmWindow() {
    const hub = new CentralCandleDataHub();
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    const start = '2026-09-01';
    const end = '2026-09-18';
    const initialCapital = 10000;

    console.log("===================================================================================");
    console.log(`📊 [11:00 AM - 3:00 PM TRADE ENTRY WINDOW BACKTEST] (Threshold 13/16)`);
    console.log(`  Entry Time Range: 11:00 AM (660 mins) to 3:00 PM (900 mins)`);
    console.log("===================================================================================\n");

    const candles = await hub.getCandlesWithWarmup(start, end, 300);
    const preparedData = prepareJSONStrategyData(candles, stratConfig);
    const dailyTradeCounts = {};

    let runningCapital = initialCapital;
    const trades = [];
    let activeTrade = null;

    for (let i = 300; i < candles.length; i++) {
        const c = candles[i];
        if (c.date < start || c.date > end) continue;

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

                trades.push({
                    date: c.date,
                    entryTime: activeTrade.entryTime,
                    exitTime: timeStr,
                    type: activeTrade.optionType,
                    numLots: activeTrade.numLots,
                    qty: activeTrade.quantity,
                    spotEntry: activeTrade.spotEntryPrice,
                    spotExit: currentSpotPrice,
                    entryPremium: activeTrade.optionPremiumPrice,
                    exitPremium: finalExitPremium,
                    pnlRupees: totalPnL,
                    pnlPoints: ptsPnL,
                    exitReason: dualExit.exitReason,
                    balanceAfter: runningCapital
                });

                activeTrade = null;
            }
        }

        // ENTRY SCANNER STRICTLY BETWEEN 11:00 AM (660 mins) and 3:00 PM (900 mins)
        if (!activeTrade && totalMins >= 660 && totalMins < 900) {
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
                    dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;

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

    console.log("Date       | Time Window  | Type | Lots | Spot Entry -> Exit | Prem Entry -> Exit | Daily PnL (₹) | Balance");
    console.log("---------------------------------------------------------------------------------------------------------");
    trades.forEach(t => {
        const pnlStr = (t.pnlRupees >= 0 ? '+' : '') + `₹${t.pnlRupees.toFixed(2)}`;
        console.log(`${t.date} | ${t.entryTime} - ${t.exitTime} | ${t.type.padEnd(4)} | ${String(t.numLots).padStart(4)} | ₹${t.spotEntry} -> ₹${t.spotExit} | ₹${t.entryPremium} -> ₹${t.exitPremium} | ${pnlStr.padStart(13)} | ₹${t.balanceAfter.toLocaleString()}`);
    });
    console.log("---------------------------------------------------------------------------------------------------------");

    const totalNetPnL = Number((runningCapital - initialCapital).toFixed(2));
    console.log(`\n🏆 11:00 AM - 3:00 PM WINDOW SUMMARY:`);
    console.log(`  Starting Capital     : ₹${initialCapital.toLocaleString()}`);
    console.log(`  Final Ending Capital : ₹${runningCapital.toLocaleString()} 🚀`);
    console.log(`  Net Realized Profit  : +₹${totalNetPnL.toLocaleString()}`);
    console.log(`  Total Trades         : ${trades.length}`);
    console.log("===================================================================================");
}

test11amTo3pmWindow().catch(console.error);
