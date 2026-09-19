const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function runFullYear2026Backtest() {
    const hub = new CentralCandleDataHub();
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    console.log("===================================================================================");
    console.log("🏆 FULL YEAR 2026 INSTITUTIONAL BACKTEST REPORT (JAN 2026 - SEP 2026)");
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

    let overallInitialCapital = 100000;
    let runningCapital = overallInitialCapital;

    const monthlySummaries = [];
    let grandTotalTrades = 0;
    let grandTotalWins = 0;
    let grandTotalLosses = 0;

    for (const m of months) {
        console.log(`🌐 Processing Month: ${m.name} (${m.start} to ${m.end})...`);
        const candles = await hub.getCandlesWithWarmup(m.start, m.end, 300);

        if (!candles || candles.length < 50) {
            console.log(`⚠️ Warning: Insufficient candle data for ${m.name}`);
            continue;
        }

        const preparedData = prepareJSONStrategyData(candles, stratConfig);
        const dailyTradeCounts = {};

        const monthStartCap = runningCapital;
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
                    
                    runningCapital = Number((runningCapital + totalPnL).toFixed(2));

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
                        balanceAfter: runningCapital
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
                            target: optionDeltaMap.optionTarget,
                            currentTarget: optionDeltaMap.optionTarget
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

        const monthNetPnL = Number((runningCapital - monthStartCap).toFixed(2));
        const monthWinRate = trades.length > 0 ? Number(((wins / trades.length) * 100).toFixed(1)) : 0;

        grandTotalTrades += trades.length;
        grandTotalWins += wins;
        grandTotalLosses += losses;

        monthlySummaries.push({
            month: m.name,
            startCap: monthStartCap,
            endCap: runningCapital,
            netPnL: monthNetPnL,
            totalTrades: trades.length,
            wins,
            losses,
            winRate: monthWinRate
        });
    }

    const overallNetPnL = Number((runningCapital - overallInitialCapital).toFixed(2));
    const overallNetPct = Number(((overallNetPnL / overallInitialCapital) * 100).toFixed(2));
    const grandWinRate = grandTotalTrades > 0 ? Number(((grandTotalWins / grandTotalTrades) * 100).toFixed(1)) : 0;

    console.log("\n===================================================================================");
    console.log("📅 MONTH-BY-MONTH PERFORMANCE TABLE (YEAR 2026)");
    console.log("===================================================================================");
    console.log("Month              | Trades | Wins/Losses | Win Rate | Net PnL (₹)     | Ending Capital");
    console.log("-----------------------------------------------------------------------------------");
    monthlySummaries.forEach(s => {
        const pnlStr = (s.netPnL >= 0 ? '+' : '') + `₹${s.netPnL.toLocaleString()}`;
        console.log(`${s.month.padEnd(18)} | ${String(s.totalTrades).padStart(6)} | ${String(s.wins).padStart(2)}W / ${String(s.losses).padStart(2)}L  | ${String(s.winRate).padStart(6)}% | ${pnlStr.padStart(15)} | ₹${s.endCap.toLocaleString()}`);
    });
    console.log("-----------------------------------------------------------------------------------");

    console.log("\n===================================================================================");
    console.log("🏆 YEAR 2026 CUMULATIVE BACKTEST PERFORMANCE SUMMARY");
    console.log("===================================================================================");
    console.log(`  Initial Capital       : ₹${overallInitialCapital.toLocaleString()}`);
    console.log(`  Final Capital         : ₹${runningCapital.toLocaleString()}`);
    console.log(`  Net Realized PnL (₹)  : ${overallNetPnL >= 0 ? '+' : ''}₹${overallNetPnL.toLocaleString()} (${overallNetPct >= 0 ? '+' : ''}${overallNetPct}%)`);
    console.log(`  Total Trades Executed : ${grandTotalTrades}`);
    console.log(`  Total Wins / Losses   : ${grandTotalWins} Wins / ${grandTotalLosses} Losses`);
    console.log(`  Overall Win Rate      : ${grandWinRate}%`);
    console.log("===================================================================================");
}

runFullYear2026Backtest().catch(console.error);
