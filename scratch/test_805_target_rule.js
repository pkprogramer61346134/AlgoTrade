const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function test805TargetRule() {
    const hub = new CentralCandleDataHub();
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    console.log("===================================================================================");
    console.log("🧪 TESTING 80.5% TARGET PROFIT BOOKING RULE ON AUG & SEP 2026");
    console.log("===================================================================================\n");

    const months = [
        { name: "September 2026", start: "2026-09-01", end: "2026-09-18" },
        { name: "August 2026", start: "2026-08-01", end: "2026-08-31" }
    ];

    for (const m of months) {
        const candles = await hub.getCandlesWithWarmup(m.start, m.end, 300);
        const preparedData = prepareJSONStrategyData(candles, stratConfig);
        const dailyTradeCounts = {};

        let capital = 100000;
        const trades = [];
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
                    
                    capital = Number((capital + totalPnL).toFixed(2));

                    trades.push({
                        date: c.date,
                        entryTime: activeTrade.entryTime,
                        exitTime: timeStr,
                        type: activeTrade.optionType,
                        entryPremium: activeTrade.optionPremiumPrice,
                        exitPremium: finalExitPremium,
                        pnlRupees: totalPnL,
                        pnlPoints: ptsPnL,
                        exitReason: dualExit.exitReason,
                        balanceAfter: capital
                    });

                    activeTrade = null;
                }
            }

            // Entry Scanner
            if (!activeTrade && totalMins >= 555 && totalMins < 900) {
                const todayTrades = dailyTradeCounts[c.date] || 0;
                if (todayTrades < 3) {
                    const signal = evaluateConsensusEngine(candles, i, stratConfig, preparedData, dailyTradeCounts, false);
                    if (signal && signal.type !== "NONE") {
                        const spotPrice = c.close;
                        const optionType = signal.type === "BUY" ? "CE" : "PE";
                        const optionPremiumPrice = Math.max(20, Math.round(spotPrice * 0.005));
                        const qty = 65;

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

                        // APPLY 80.5% TARGET PROFIT BOOKING CAP
                        const rawTargetPts = optionDeltaMap.premiumTargetPoints;
                        const target805Pts = Number((rawTargetPts * 0.805).toFixed(2));
                        const target805Price = Number((optionPremiumPrice + target805Pts).toFixed(2));

                        activeTrade = {
                            date: c.date,
                            entryTime: timeStr,
                            optionType,
                            spotEntryPrice: spotPrice,
                            spotSL: spotStruct.spotSL,
                            spotTarget: spotStruct.spotTarget,
                            quantity: qty,
                            optionPremiumPrice,
                            initialSL: optionDeltaMap.optionSL,
                            currentSL: optionDeltaMap.optionSL,
                            target: target805Price,
                            currentTarget: target805Price
                        };
                    }
                }
            }
        }

        let wins = 0;
        let losses = 0;
        trades.forEach(t => {
            if (t.pnlRupees > 0) wins++;
            else if (t.pnlRupees < 0) losses++;
        });

        const netPnL = Number((capital - 100000).toFixed(2));
        const winRate = trades.length > 0 ? Number(((wins / trades.length) * 100).toFixed(1)) : 0;

        console.log(`📋 [80.5% TARGET RULE SUMMARY - ${m.name}]`);
        console.log(`  Initial Capital       : ₹100,000`);
        console.log(`  Final Capital         : ₹${capital.toLocaleString()}`);
        console.log(`  Net Realized PnL (₹)  : ${netPnL >= 0 ? '+' : ''}₹${netPnL} (${(netPnL / 1000).toFixed(2)}%)`);
        console.log(`  Total Trades Executed : ${trades.length}`);
        console.log(`  Wins / Losses         : ${wins} Wins / ${losses} Losses`);
        console.log(`  Win Rate              : ${winRate}%\n`);
    }
}

test805TargetRule().catch(console.error);
