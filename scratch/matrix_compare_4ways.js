/**
 * 4-WAY MULTI-COMBINATION BACKTEST COMPARISON SUITE
 * Location: c:\AlgoTrade\scratch\matrix_compare_4ways.js
 * 
 * Tests and compares 4 feature combinations over 1 Year of historical candle data (2025-09-01 to 2026-09-18):
 * Option 1: Pure Normal (No Extended Trailing SL, No Golden Pattern Filter)
 * Option 2: Extended Trailing SL Only (No Golden Pattern Filter)
 * Option 3: Golden Pattern Filter Only (Normal Target 1:2 R:R, No Extended Rider)
 * Option 4: Full Combo (Extended Trailing SL + Golden Pattern Filter)
 */

const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function runBacktestFor4WayMatrix(candles, baseConfig, extendedRiderOn, goldenFilterOn, initialCapital = 100000) {
    const config = JSON.parse(JSON.stringify(baseConfig));
    if (!config.extendedProfitRider) config.extendedProfitRider = {};
    config.extendedProfitRider.enabled = extendedRiderOn;

    if (!config.goldenPatternFilter) config.goldenPatternFilter = {};
    config.goldenPatternFilter.enabled = goldenFilterOn;

    const preparedData = prepareJSONStrategyData(candles, config);
    const dailyTradeCounts = {};

    let capital = Number(initialCapital);
    const trades = [];
    let activeTrade = null;
    let maxCapital = capital;
    let maxDrawdown = 0;

    for (let i = 300; i < candles.length; i++) {
        const c = candles[i];
        const timeStr = c.time || '09:15';
        const parts = timeStr.split(':').map(Number);
        const totalMins = parts[0] * 60 + (parts[1] || 0);

        // Position Monitor
        if (activeTrade) {
            const currentSpotPrice = c.close;
            const spotMove = currentSpotPrice - activeTrade.spotEntryPrice;
            const deltaMove = activeTrade.optionType === "CE" ? (spotMove * 0.50) : (-spotMove * 0.50);
            const currentOptionPremium = Math.max(0.5, Number((activeTrade.optionPremiumPrice + deltaMove).toFixed(2)));

            if (currentOptionPremium > activeTrade.highestPremium) {
                activeTrade.highestPremium = currentOptionPremium;
            }

            // Trailing SL to breakeven cost when profit >= 50% target distance
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

                capital = Number((capital + totalPnL).toFixed(2));
                if (capital > maxCapital) maxCapital = capital;
                const dd = maxCapital - capital;
                if (dd > maxDrawdown) maxDrawdown = dd;

                trades.push({
                    id: trades.length + 1,
                    date: c.date,
                    entryTime: activeTrade.entryTime,
                    exitTime: timeStr,
                    optionType: activeTrade.optionType,
                    numLots: activeTrade.numLots,
                    quantity: activeTrade.quantity,
                    spotEntryPrice: activeTrade.spotEntryPrice,
                    spotExitPrice: currentSpotPrice,
                    optionPremiumPrice: activeTrade.optionPremiumPrice,
                    exitPremiumPrice: finalExitPremium,
                    pnlRupees: totalPnL,
                    pnlPoints: ptsPnL,
                    exitReason: dualExit.exitReason,
                    balanceAfter: capital
                });

                activeTrade = null;
            }
        }

        // Entry Signal Evaluation
        const startMins = config.entryStartMins || 555; // 09:15 AM
        const endMins = config.entryEndMins || 900;     // 3:00 PM

        if (!activeTrade && totalMins >= startMins && totalMins < endMins) {
            const todayTrades = dailyTradeCounts[c.date] || 0;
            if (todayTrades < 3) {
                const signal = evaluateConsensusEngine(candles, i, config, preparedData, dailyTradeCounts, false);

                if (signal && signal.type !== "NONE") {
                    dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;
                    const spotPrice = c.close;
                    const optionType = signal.type === "BUY" ? "CE" : "PE";
                    const optionPremiumPrice = Math.max(20, Math.round(spotPrice * 0.005));

                    const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
                        spotPrice,
                        signalType: signal.type,
                        stopLoss: signal.stopLoss,
                        targetPrice: signal.targetPrice,
                        riskRewardRatio: signal.rrMultiplier || 2.0
                    });

                    const deltaMap = SpotRiskDeltaCalculator.mapSpotToOptionDelta({
                        spotPrice,
                        spotSL: spotStruct.spotSL,
                        spotTarget: spotStruct.spotTarget,
                        optionPremiumPrice,
                        optionType,
                        delta: 0.50
                    });

                    activeTrade = {
                        date: c.date,
                        entryTime: timeStr,
                        optionType,
                        quantity: 65,
                        numLots: 1,
                        spotEntryPrice: spotPrice,
                        spotSL: spotStruct.spotSL,
                        spotTarget: spotStruct.spotTarget,
                        optionPremiumPrice,
                        currentSL: deltaMap.optionSL,
                        initialSL: deltaMap.optionSL,
                        target: deltaMap.optionTarget,
                        highestPremium: optionPremiumPrice,
                        extendedRiderEnabled: extendedRiderOn,
                        t1Hit: false
                    };
                }
            }
        }
    }

    const wins = trades.filter(t => t.pnlRupees >= 0).length;
    const losses = trades.filter(t => t.pnlRupees < 0).length;
    const winRate = trades.length > 0 ? Number(((wins / trades.length) * 100).toFixed(1)) : 0;
    const netPnL = Number((capital - initialCapital).toFixed(2));
    const avgTradePnL = trades.length > 0 ? Number((netPnL / trades.length).toFixed(2)) : 0;

    return {
        extendedRiderOn,
        goldenFilterOn,
        totalTrades: trades.length,
        wins,
        losses,
        winRate,
        initialCapital,
        finalCapital: capital,
        netPnL,
        avgTradePnL,
        maxDrawdown: Number(maxDrawdown.toFixed(2))
    };
}

async function run4WayComparison() {
    console.log("=========================================================================================");
    console.log("📊 4-WAY MATRIX COMPARISON: EXTENDED TRAILING SL vs GOLDEN PATTERN FILTER vs COMBINATIONS");
    console.log("=========================================================================================\n");

    const hub = new CentralCandleDataHub();
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    let stratConfig = {};
    if (fs.existsSync(stratPath)) {
        stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));
    }

    // Load 1 year historical candle dataset
    console.log("💾 Fetching 1-Year Historical Candle Data (2025-09-01 to 2026-09-18)...");
    const candles = await hub.getCandlesWithWarmup('2025-09-01', '2026-09-18', 300);
    console.log(`✅ Loaded ${candles.length} historical candles.\n`);

    console.log("⏳ Testing Option 1: Pure Normal (No Extended Trailing SL, No Golden Filter)...");
    const opt1 = await runBacktestFor4WayMatrix(candles, stratConfig, false, false, 100000);

    console.log("⏳ Testing Option 2: Extended Trailing SL Only (No Golden Filter)...");
    const opt2 = await runBacktestFor4WayMatrix(candles, stratConfig, true, false, 100000);

    console.log("⏳ Testing Option 3: Golden Pattern Filter Only (Normal Target 1:2, No Extended Trailing SL)...");
    const opt3 = await runBacktestFor4WayMatrix(candles, stratConfig, false, true, 100000);

    console.log("⏳ Testing Option 4: Full Combination (Extended Trailing SL + Golden Pattern Filter)...");
    const opt4 = await runBacktestFor4WayMatrix(candles, stratConfig, true, true, 100000);

    console.log("\n=========================================================================================");
    console.log("🏆 COMPLETE 4-WAY COMPARISON MATRIX RESULTS (1-YEAR DATA):");
    console.log("=========================================================================================");

    const matrixTable = [
        {
            "Option Name": "Option 1: Pure Normal (No Trailing, No Golden Filter)",
            "Trailing SL": "OFF",
            "Golden Filter": "OFF",
            "Trades": opt1.totalTrades,
            "Win Rate (%)": `${opt1.winRate}%`,
            "Final Cap (₹)": `₹${opt1.finalCapital.toLocaleString()}`,
            "Net Profit (₹)": `₹${opt1.netPnL.toLocaleString()}`,
            "Avg PnL/Trade": `₹${opt1.avgTradePnL}`,
            "Max Drawdown": `₹${opt1.maxDrawdown}`
        },
        {
            "Option Name": "Option 2: Extended Trailing SL Only",
            "Trailing SL": "ON",
            "Golden Filter": "OFF",
            "Trades": opt2.totalTrades,
            "Win Rate (%)": `${opt2.winRate}%`,
            "Final Cap (₹)": `₹${opt2.finalCapital.toLocaleString()}`,
            "Net Profit (₹)": `₹${opt2.netPnL.toLocaleString()}`,
            "Avg PnL/Trade": `₹${opt2.avgTradePnL}`,
            "Max Drawdown": `₹${opt2.maxDrawdown}`
        },
        {
            "Option Name": "Option 3: Golden Pattern Filter Only (Normal 1:2 R:R)",
            "Trailing SL": "OFF",
            "Golden Filter": "ON",
            "Trades": opt3.totalTrades,
            "Win Rate (%)": `${opt3.winRate}%`,
            "Final Cap (₹)": `₹${opt3.finalCapital.toLocaleString()}`,
            "Net Profit (₹)": `₹${opt3.netPnL.toLocaleString()}`,
            "Avg PnL/Trade": `₹${opt3.avgTradePnL}`,
            "Max Drawdown": `₹${opt3.maxDrawdown}`
        },
        {
            "Option Name": "Option 4: Full Combination (Extended Trailing SL + Golden Filter)",
            "Trailing SL": "ON",
            "Golden Filter": "ON",
            "Trades": opt4.totalTrades,
            "Win Rate (%)": `${opt4.winRate}%`,
            "Final Cap (₹)": `₹${opt4.finalCapital.toLocaleString()}`,
            "Net Profit (₹)": `₹${opt4.netPnL.toLocaleString()}`,
            "Avg PnL/Trade": `₹${opt4.avgTradePnL}`,
            "Max Drawdown": `₹${opt4.maxDrawdown}`
        }
    ];

    console.table(matrixTable);

    // Find Best 2 Options based on Net Profit and Avg PnL / Trade
    const sorted = [
        { name: "Option 1: Pure Normal", res: opt1 },
        { name: "Option 2: Extended Trailing SL Only", res: opt2 },
        { name: "Option 3: Golden Pattern Filter Only", res: opt3 },
        { name: "Option 4: Full Combo (Extended Trailing SL + Golden Filter)", res: opt4 }
    ].sort((a, b) => b.res.netPnL - a.res.netPnL);

    console.log("\n🥇 BEST TOP 2 STRATEGY CONFIGURATIONS RANKING:");
    console.log(`1️⃣ RANK #1 BEST: ${sorted[0].name}`);
    console.log(`   - Net Profit  : ₹${sorted[0].res.netPnL.toLocaleString()} (+${((sorted[0].res.netPnL / 100000) * 100).toFixed(1)}% Return)`);
    console.log(`   - Win Rate    : ${sorted[0].res.winRate}% (${sorted[0].res.wins} Wins / ${sorted[0].res.losses} Losses in ${sorted[0].res.totalTrades} Trades)`);
    console.log(`   - Avg PnL/Trade: ₹${sorted[0].res.avgTradePnL}`);
    console.log(`   - Max Drawdown: ₹${sorted[0].res.maxDrawdown}`);

    console.log(`\n2️⃣ RANK #2 SECOND BEST: ${sorted[1].name}`);
    console.log(`   - Net Profit  : ₹${sorted[1].res.netPnL.toLocaleString()} (+${((sorted[1].res.netPnL / 100000) * 100).toFixed(1)}% Return)`);
    console.log(`   - Win Rate    : ${sorted[1].res.winRate}% (${sorted[1].res.wins} Wins / ${sorted[1].res.losses} Losses in ${sorted[1].res.totalTrades} Trades)`);
    console.log(`   - Avg PnL/Trade: ₹${sorted[1].res.avgTradePnL}`);
    console.log(`   - Max Drawdown: ₹${sorted[1].res.maxDrawdown}`);

    console.log("\n=========================================================================================\n");
}

run4WayComparison().catch(err => {
    console.error("❌ Error running 4-way comparison:", err);
});
