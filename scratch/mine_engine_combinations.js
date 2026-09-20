/**
 * 17-SUB-ENGINE VOTING PATTERN MINER
 * Location: c:\AlgoTrade\scratch\mine_engine_combinations.js
 * 
 * Runs historical backtesting across all available 5-minute candle datasets,
 * captures exact voting signatures (which engines voted YES/NO) for every signal,
 * tracks trade outcomes (Target Hit vs SL Hit), and ranks combinations by Win Rate.
 */

const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function mineEngineCombinations() {
    console.log("=========================================================================================");
    console.log("🔍 HISTORICAL 17-SUB-ENGINE PATTERN MINING & COMBINATION ANALYSIS");
    console.log("=========================================================================================\n");

    const hub = new CentralCandleDataHub();
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    let stratConfig = {};
    if (fs.existsSync(stratPath)) {
        stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));
    }

    // Load full historical candles from 2025 to 2026
    const candles = await hub.getCandlesWithWarmup('2025-01-01', '2026-09-18', 300);
    console.log(`📊 Loaded ${candles.length} total 5-minute historical candles for pattern mining.`);

    const preparedData = prepareJSONStrategyData(candles, stratConfig);
    const dailyTradeCounts = {};

    // Map to store results per pattern signature
    const patternStats = {};

    let activeTrade = null;

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

            // Trailing SL to breakeven
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
                const isWin = ptsPnL >= 0;

                const patKey = activeTrade.patternKey;
                if (!patternStats[patKey]) {
                    patternStats[patKey] = {
                        patternKey: patKey,
                        engineCount: activeTrade.engineCount,
                        yesEngines: activeTrade.yesEngines,
                        totalTrades: 0,
                        wins: 0,
                        losses: 0,
                        totalPnL: 0,
                        totalPtsPnL: 0,
                        hasEngine17: activeTrade.hasEngine17,
                        hasEngine16: activeTrade.hasEngine16,
                        hasEngine1: activeTrade.hasEngine1,
                        hasEngine4: activeTrade.hasEngine4
                    };
                }

                patternStats[patKey].totalTrades++;
                if (isWin) patternStats[patKey].wins++;
                else patternStats[patKey].losses++;
                patternStats[patKey].totalPnL += totalPnL;
                patternStats[patKey].totalPtsPnL += ptsPnL;

                activeTrade = null;
            }
        }

        // Entry Signal Evaluation
        const startMins = stratConfig.entryStartMins || 555; // 09:15 AM
        const endMins = stratConfig.entryEndMins || 900;     // 3:00 PM

        if (!activeTrade && totalMins >= startMins && totalMins < endMins) {
            const todayTrades = dailyTradeCounts[c.date] || 0;
            if (todayTrades < 3) {
                const signal = evaluateConsensusEngine(candles, i, stratConfig, preparedData, dailyTradeCounts, false);

                if (signal && signal.type !== "NONE") {
                    dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;
                    const spotPrice = c.close;
                    const optionType = signal.type === "BUY" ? "CE" : "PE";
                    const optionPremiumPrice = Math.max(20, Math.round(spotPrice * 0.005));

                    // Extract which specific engines voted YES
                    const yesEngines = [];
                    let hasEngine17 = false;
                    let hasEngine16 = false;
                    let hasEngine1 = false;
                    let hasEngine4 = false;

                    if (signal.voteDetails && Array.isArray(signal.voteDetails)) {
                        signal.voteDetails.forEach(vStr => {
                            const match = vStr.match(/Engine\s+(\d+)/i);
                            if (match) {
                                const engNum = parseInt(match[1], 10);
                                if (!yesEngines.includes(engNum)) yesEngines.push(engNum);
                                if (engNum === 17) hasEngine17 = true;
                                if (engNum === 16) hasEngine16 = true;
                                if (engNum === 1) hasEngine1 = true;
                                if (engNum === 4) hasEngine4 = true;
                            }
                        });
                    }

                    yesEngines.sort((a, b) => a - b);
                    const patternKey = yesEngines.length > 0 ? yesEngines.map(e => `E${e}`).join('+') : 'GENERIC_CONSENSUS';

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
                        t1Hit: false,
                        patternKey,
                        engineCount: yesEngines.length,
                        yesEngines,
                        hasEngine17,
                        hasEngine16,
                        hasEngine1,
                        hasEngine4
                    };
                }
            }
        }
    }

    // Process and sort results
    const results = Object.values(patternStats).map(p => {
        const winRate = p.totalTrades > 0 ? Number(((p.wins / p.totalTrades) * 100).toFixed(1)) : 0;
        return {
            ...p,
            winRate,
            avgPtsPnL: p.totalTrades > 0 ? Number((p.totalPtsPnL / p.totalTrades).toFixed(1)) : 0
        };
    });

    results.sort((a, b) => b.winRate - a.winRate || b.totalTrades - a.totalTrades);

    console.log("=========================================================================================");
    console.log("🏆 TOP HIGH-WIN-RATE SUB-ENGINE PATTERNS FOUND:");
    console.log("=========================================================================================");
    console.table(results.map(r => ({
        Pattern: r.patternKey,
        Trades: r.totalTrades,
        Wins: r.wins,
        Losses: r.losses,
        "Win Rate (%)": `${r.winRate}%`,
        "Total PnL (₹)": `₹${r.totalPnL.toFixed(2)}`,
        "Engines Count": r.engineCount,
        "SMC #17": r.hasEngine17 ? 'YES' : 'NO',
        "BN #16": r.hasEngine16 ? 'YES' : 'NO',
        "ORB #1": r.hasEngine1 ? 'YES' : 'NO'
    })));

    // Extract Golden Combinations (Win Rate >= 75%, Min 1 Trade)
    const goldenCombos = results.filter(r => r.winRate >= 75.0);
    console.log(`\n✨ Total Golden Combination Patterns Identified (Win Rate >= 75%): ${goldenCombos.length}`);
    
    // Save golden patterns summary JSON to server/data
    const outDir = path.resolve(__dirname, '../server/data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'golden_patterns.json');
    fs.writeFileSync(outFile, JSON.stringify(goldenCombos, null, 2));
    console.log(`💾 Saved Golden Patterns to: ${outFile}`);

    return goldenCombos;
}

mineEngineCombinations().catch(err => {
    console.error("❌ Error running pattern mining:", err);
});
