/**
 * 1-YEAR COMPARATIVE BACKTESTING SUITE
 * Location: c:\AlgoTrade\scratch\compare_1year_backtest.js
 * 
 * Compares 1 Year of Historical Trading Performance:
 * Mode A: Standard 17-Engine Consensus (Any 11/17 Majority)
 * Mode B: Golden Combination Pattern Filtered Engine (High Conviction Combo)
 */

const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function runBacktestForMode(candles, baseConfig, enableGoldenFilter = false, initialCapital = 100000) {
    const config = JSON.parse(JSON.stringify(baseConfig));
    if (!config.goldenPatternFilter) config.goldenPatternFilter = {};
    config.goldenPatternFilter.enabled = enableGoldenFilter;

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
                        extendedRiderEnabled: true,
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
        modeName: enableGoldenFilter ? "Golden Pattern Filter (Enhanced)" : "Standard 11/17 Consensus (Baseline)",
        totalTrades: trades.length,
        wins,
        losses,
        winRate,
        initialCapital,
        finalCapital: capital,
        netPnL,
        avgTradePnL,
        maxDrawdown: Number(maxDrawdown.toFixed(2)),
        trades
    };
}

async function run1YearComparison() {
    console.log("=========================================================================================");
    console.log("📊 1-YEAR COMPARATIVE BACKTEST: BASELINE VS GOLDEN PATTERN FILTERED STRATEGY");
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

    console.log("⏳ Running Backtest Mode 1: Standard 11/17 Consensus (Baseline)...");
    const baselineResult = await runBacktestForMode(candles, stratConfig, false, 100000);

    console.log("⏳ Running Backtest Mode 2: Golden Combination Pattern Filtered (Enhanced)...");
    const goldenResult = await runBacktestForMode(candles, stratConfig, true, 100000);

    console.log("\n=========================================================================================");
    console.log("🏆 1-YEAR SIDE-BY-SIDE BACKTEST PERFORMANCE COMPARISON:");
    console.log("=========================================================================================");
    
    console.table([
        {
            "Strategy Mode": baselineResult.modeName,
            "Total Trades": baselineResult.totalTrades,
            "Wins": baselineResult.wins,
            "Losses": baselineResult.losses,
            "Win Rate (%)": `${baselineResult.winRate}%`,
            "Initial Cap": `₹${baselineResult.initialCapital.toLocaleString()}`,
            "Final Cap": `₹${baselineResult.finalCapital.toLocaleString()}`,
            "Net Profit (₹)": `₹${baselineResult.netPnL.toLocaleString()}`,
            "Avg Trade PnL": `₹${baselineResult.avgTradePnL}`,
            "Max Drawdown": `₹${baselineResult.maxDrawdown}`
        },
        {
            "Strategy Mode": goldenResult.modeName,
            "Total Trades": goldenResult.totalTrades,
            "Wins": goldenResult.wins,
            "Losses": goldenResult.losses,
            "Win Rate (%)": `${goldenResult.winRate}%`,
            "Initial Cap": `₹${goldenResult.initialCapital.toLocaleString()}`,
            "Final Cap": `₹${goldenResult.finalCapital.toLocaleString()}`,
            "Net Profit (₹)": `₹${goldenResult.netPnL.toLocaleString()}`,
            "Avg Trade PnL": `₹${goldenResult.avgTradePnL}`,
            "Max Drawdown": `₹${goldenResult.maxDrawdown}`
        }
    ]);

    const winRateDiff = Number((goldenResult.winRate - baselineResult.winRate).toFixed(1));
    const pnlDiff = Number((goldenResult.netPnL - baselineResult.netPnL).toFixed(2));
    const ddDiff = Number((baselineResult.maxDrawdown - goldenResult.maxDrawdown).toFixed(2));

    console.log("\n📈 KEY STRATEGY IMPROVEMENTS WITH GOLDEN PATTERN FILTER:");
    console.log(`   - Win Rate Shift   : ${winRateDiff >= 0 ? '+' : ''}${winRateDiff}% (From ${baselineResult.winRate}% -> ${goldenResult.winRate}%)`);
    console.log(`   - Net PnL Gain     : ${pnlDiff >= 0 ? '+' : ''}₹${pnlDiff.toLocaleString()}`);
    console.log(`   - Drawdown Reduced : ₹${ddDiff.toLocaleString()} less drawdown!`);
    console.log("=========================================================================================\n");
}

run1YearComparison().catch(err => {
    console.error("❌ Error running 1-year comparison:", err);
});
