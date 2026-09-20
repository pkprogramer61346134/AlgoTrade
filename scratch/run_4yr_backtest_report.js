const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function run4YearBacktestReport() {
    const hub = new CentralCandleDataHub();
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    console.log("===================================================================================");
    console.log("🏆 4-YEAR CUMULATIVE INSTITUTIONAL BACKTEST REPORT (2023 - 2026)");
    console.log("===================================================================================\n");

    const years = [
        { year: "2023", start: "2023-01-01", end: "2023-12-31" },
        { year: "2024", start: "2024-01-01", end: "2024-12-31" },
        { year: "2025", start: "2025-01-01", end: "2025-12-31" },
        { year: "2026", start: "2026-01-01", end: "2026-09-18" }
    ];

    let overallInitialCapital = 100000;
    let runningCapital = overallInitialCapital;

    const yearlySummaries = [];
    let grandTotalTrades = 0;
    let grandTotalWins = 0;
    let grandTotalLosses = 0;
    let grandTotalBreakevens = 0;

    for (const y of years) {
        console.log(`🌐 Processing Year: ${y.year} (${y.start} to ${y.end})...`);
        const candles = await hub.getCandlesWithWarmup(y.start, y.end, 300);

        if (!candles || candles.length < 500) {
            console.log(`⚠️ Warning: Insufficient candle data for ${y.year}`);
            continue;
        }

        const preparedData = prepareJSONStrategyData(candles, stratConfig);
        const dailyTradeCounts = {};

        const yearStartCap = runningCapital;
        const trades = [];
        let activeTrade = null;

        for (let i = 300; i < candles.length; i++) {
            const c = candles[i];
            if (c.date < y.start || c.date > y.end) continue;

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

                // DYNAMIC TRAILING SL TO BREAKEVEN: When profit reaches >= 50% of target distance, trail SL to Entry Price!
                const targetDist = activeTrade.target - activeTrade.optionPremiumPrice;
                if (targetDist > 0 && (activeTrade.highestPremium - activeTrade.optionPremiumPrice) >= (targetDist * 0.50)) {
                    if (activeTrade.currentSL < activeTrade.optionPremiumPrice) {
                        activeTrade.currentSL = activeTrade.optionPremiumPrice; // Trail to Cost!
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

            // Entry Scanner (VWAP Filter + 14/16 Consensus Threshold)
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
                            numLots: 1,
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

        let wins = 0;
        let losses = 0;
        let breakevens = 0;
        trades.forEach(t => {
            if (t.pnlRupees > 0) wins++;
            else if (t.pnlRupees === 0) breakevens++;
            else losses++;
        });

        const yearNetPnL = Number((runningCapital - yearStartCap).toFixed(2));
        const yearWinRate = trades.length > 0 ? Number((((wins + breakevens) / trades.length) * 100).toFixed(1)) : 0;

        grandTotalTrades += trades.length;
        grandTotalWins += wins;
        grandTotalLosses += losses;
        grandTotalBreakevens += breakevens;

        yearlySummaries.push({
            year: y.year,
            startCap: yearStartCap,
            endCap: runningCapital,
            netPnL: yearNetPnL,
            totalTrades: trades.length,
            wins,
            losses,
            breakevens,
            winRate: yearWinRate
        });
    }

    const overallNetPnL = Number((runningCapital - overallInitialCapital).toFixed(2));
    const overallNetPct = Number(((overallNetPnL / overallInitialCapital) * 100).toFixed(2));
    const grandWinRate = grandTotalTrades > 0 ? Number((((grandTotalWins + grandTotalBreakevens) / grandTotalTrades) * 100).toFixed(1)) : 0;

    console.log("\n===================================================================================");
    console.log("📅 YEAR-BY-YEAR PERFORMANCE SUMMARY TABLE (2023 - 2026)");
    console.log("===================================================================================");
    console.log("Year | Trades | Wins/Losses/BE | Win+BE Rate | Yearly Net PnL (₹) | Ending Account Capital");
    console.log("-----------------------------------------------------------------------------------");
    yearlySummaries.forEach(s => {
        const pnlStr = (s.netPnL >= 0 ? '+' : '') + `₹${s.netPnL.toLocaleString()}`;
        console.log(`${s.year.padEnd(4)} | ${String(s.totalTrades).padStart(6)} | ${String(s.wins).padStart(2)}W / ${String(s.losses).padStart(2)}L / ${String(s.breakevens).padStart(2)}BE | ${String(s.winRate).padStart(9)}% | ${pnlStr.padStart(18)} | ₹${s.endCap.toLocaleString()}`);
    });
    console.log("-----------------------------------------------------------------------------------");

    console.log("\n===================================================================================");
    console.log("🏆 4-YEAR CUMULATIVE BACKTEST PERFORMANCE SUMMARY");
    console.log("===================================================================================");
    console.log(`  Initial Starting Capital : ₹${overallInitialCapital.toLocaleString()}`);
    console.log(`  Final Ending Capital     : ₹${runningCapital.toLocaleString()}`);
    console.log(`  Net Realized PnL (₹)     : ${overallNetPnL >= 0 ? '+' : ''}₹${overallNetPnL.toLocaleString()} (${overallNetPct >= 0 ? '+' : ''}${overallNetPct}%)`);
    console.log(`  Total Trades Executed    : ${grandTotalTrades}`);
    console.log(`  Total Wins / Losses / BE : ${grandTotalWins} Wins / ${grandTotalLosses} Losses / ${grandTotalBreakevens} Breakevens`);
    console.log(`  Capital Protection Rate  : ${grandWinRate}%`);
    console.log("===================================================================================");
}

run4YearBacktestReport().catch(console.error);
