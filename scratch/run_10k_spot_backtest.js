const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function run10kSpotBacktest() {
    const hub = new CentralCandleDataHub();
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    const initialCapital = 10000; // ₹10,000 Initial Capital

    console.log("===================================================================================");
    console.log(`📊 [₹10,000 INITIAL CAPITAL BACKTEST REPORT] Dhan API Real Nifty Spot Data`);
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
    let grandTotalTrades = 0;
    let grandTotalWins = 0;
    let grandTotalLosses = 0;
    let grandTotalBreakevens = 0;
    let totalSpotPointsGained = 0;

    const monthlySummaries = [];

    for (const m of months) {
        const candles = await hub.getCandlesWithWarmup(m.start, m.end, 300);
        if (!candles || candles.length < 50) continue;

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

                if (currentOptionPremium > activeTrade.highestPremium) {
                    activeTrade.highestPremium = currentOptionPremium;
                }

                // DYNAMIC TRAILING SL TO BREAKEVEN: When profit reaches >= 50% of target distance, trail SL to Entry Price!
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

                    const spotPtsGained = activeTrade.optionType === "CE" ? (currentSpotPrice - activeTrade.spotEntryPrice) : (activeTrade.spotEntryPrice - currentSpotPrice);
                    totalSpotPointsGained += spotPtsGained;

                    runningCapital = Number((runningCapital + totalPnL).toFixed(2));

                    trades.push({
                        date: c.date,
                        entryTime: activeTrade.entryTime,
                        exitTime: timeStr,
                        type: activeTrade.optionType,
                        spotEntry: activeTrade.spotEntryPrice,
                        spotExit: currentSpotPrice,
                        spotPtsGained: Number(spotPtsGained.toFixed(2)),
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
                        const qty = 65; // 1 Lot Nifty (Affordable with ₹10,000)

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

        const monthNetPnL = Number((runningCapital - monthStartCap).toFixed(2));
        const monthWinRate = trades.length > 0 ? Number((((wins + breakevens) / trades.length) * 100).toFixed(1)) : 0;

        grandTotalTrades += trades.length;
        grandTotalWins += wins;
        grandTotalLosses += losses;
        grandTotalBreakevens += breakevens;

        monthlySummaries.push({
            month: m.name,
            startCap: monthStartCap,
            endCap: runningCapital,
            netPnL: monthNetPnL,
            totalTrades: trades.length,
            wins,
            losses,
            breakevens,
            winRate: monthWinRate
        });
    }

    const overallNetPnL = Number((runningCapital - initialCapital).toFixed(2));
    const overallNetPct = Number(((overallNetPnL / initialCapital) * 100).toFixed(2));

    console.log("===================================================================================");
    console.log("📅 ₹10,000 CAPITAL BACKTEST MONTHLY BREAKDOWN (YEAR 2026)");
    console.log("===================================================================================");
    console.log("Month              | Trades | Wins/Losses/BE | Win+BE Rate | Monthly PnL (₹) | Ending Account Capital");
    console.log("-----------------------------------------------------------------------------------");
    monthlySummaries.forEach(s => {
        const pnlStr = (s.netPnL >= 0 ? '+' : '') + `₹${s.netPnL.toLocaleString()}`;
        console.log(`${s.month.padEnd(18)} | ${String(s.totalTrades).padStart(6)} | ${String(s.wins).padStart(2)}W / ${String(s.losses).padStart(2)}L / ${String(s.breakevens).padStart(2)}BE | ${String(s.winRate).padStart(9)}% | ${pnlStr.padStart(15)} | ₹${s.endCap.toLocaleString()}`);
    });
    console.log("-----------------------------------------------------------------------------------");

    console.log("\n===================================================================================");
    console.log("🏆 ₹10,000 INITIAL CAPITAL CUMULATIVE BACKTEST SUMMARY (2026)");
    console.log("===================================================================================");
    console.log(`  Starting Capital       : ₹${initialCapital.toLocaleString()}`);
    console.log(`  Final Ending Capital   : ₹${runningCapital.toLocaleString()} 🚀`);
    console.log(`  Net Realized PnL (₹)   : ${overallNetPnL >= 0 ? '+' : ''}₹${overallNetPnL.toLocaleString()} (+${overallNetPct}%)`);
    console.log(`  Total Spot Pts Gained  : +${totalSpotPointsGained.toFixed(1)} Spot Chart Points`);
    console.log(`  Total Trades Executed  : ${grandTotalTrades}`);
    console.log(`  Wins / Losses / BE     : ${grandTotalWins} Wins / ${grandTotalLosses} Losses / ${grandTotalBreakevens} Breakevens`);
    console.log("===================================================================================");
}

run10kSpotBacktest().catch(console.error);
