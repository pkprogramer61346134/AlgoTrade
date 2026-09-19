const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function analyzeTargetBehavior() {
    const hub = new CentralCandleDataHub();
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    console.log("===================================================================================");
    console.log("🔍 QUANTITATIVE ANALYSIS: NEAR-TARGET REVERSALS & 3X EXTENDED TARGET MOVES");
    console.log("===================================================================================\n");

    const months = [
        { name: "September 2026", start: "2026-09-01", end: "2026-09-18" },
        { name: "August 2026", start: "2026-08-01", end: "2026-08-31" }
    ];

    let totalTradesChecked = 0;
    let nearTargetReversals = 0; // Reached >= 80% of target but failed to hit target
    let targetHitCount = 0;
    let reached3xTargetCount = 0; // Reached 1:3 R:R or 3x Option target

    const detailedAnalysis = [];

    for (const m of months) {
        const candles = await hub.getCandlesWithWarmup(m.start, m.end, 300);
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

                // Track Maximum Favorable Excursion (MFE) during trade lifespan
                if (currentOptionPremium > activeTrade.highestPremium) {
                    activeTrade.highestPremium = currentOptionPremium;
                }
                if (currentSpotPrice > activeTrade.highestSpot) activeTrade.highestSpot = currentSpotPrice;
                if (currentSpotPrice < activeTrade.lowestSpot) activeTrade.lowestSpot = currentSpotPrice;

                const dualExit = SpotRiskDeltaCalculator.evaluateDualLayerExit({
                    currentSpotPrice,
                    currentOptionPremium,
                    activePosition: activeTrade,
                    totalMins
                });

                if (dualExit.exitTriggered) {
                    totalTradesChecked++;
                    const optionRiskPts = activeTrade.optionPremiumPrice - activeTrade.initialSL;
                    const optionTargetPts = activeTrade.target - activeTrade.optionPremiumPrice;
                    const maxPremiumPtsGained = activeTrade.highestPremium - activeTrade.optionPremiumPrice;

                    const pctOfTargetReached = optionTargetPts > 0 ? (maxPremiumPtsGained / optionTargetPts) * 100 : 0;
                    const maxRRReached = optionRiskPts > 0 ? (maxPremiumPtsGained / optionRiskPts) : 0;

                    const isNearTargetReversal = dualExit.exitReason !== "TARGET_HIT" && pctOfTargetReached >= 80.0;
                    const reached3x = maxRRReached >= 3.0 || maxPremiumPtsGained >= (optionTargetPts * 1.5);

                    if (isNearTargetReversal) nearTargetReversals++;
                    if (dualExit.exitReason === "TARGET_HIT") targetHitCount++;
                    if (reached3x) reached3xTargetCount++;

                    detailedAnalysis.push({
                        month: m.name,
                        date: c.date,
                        entryTime: activeTrade.entryTime,
                        exitTime: timeStr,
                        optionType: activeTrade.optionType,
                        entrySpot: activeTrade.spotEntryPrice,
                        entryPremium: activeTrade.optionPremiumPrice,
                        targetPremium: activeTrade.target,
                        highestPremium: activeTrade.highestPremium,
                        exitReason: dualExit.exitReason,
                        pctOfTargetReached: Number(pctOfTargetReached.toFixed(1)),
                        maxRRReached: Number(maxRRReached.toFixed(2)),
                        isNearTargetReversal,
                        reached3x
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
                            highestPremium: optionPremiumPrice,
                            highestSpot: spotPrice,
                            lowestSpot: spotPrice,
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

    console.log(`📊 [TRADE-BY-TRADE MAXIMUM EXCURSION BREAKDOWN] (${detailedAnalysis.length} Trades Evaluated)\n`);

    detailedAnalysis.forEach((t, idx) => {
        let tag = "⚪ STANDARD EXCURSION";
        if (t.isNearTargetReversal) tag = "⚠️ NEAR-TARGET REVERSAL (>=80% Target Reached & Failed)";
        if (t.reached3x) tag = "🚀 EXPLOSIVE 3X EXTENDED TARGET (>= 1:3 R:R)";

        console.log(`[Trade #${idx + 1}] 📅 ${t.date} ${t.entryTime} | NIFTY ${t.optionType} @ Entry ₹${t.entryPremium}`);
        console.log(`   - Target Premium     : ₹${t.targetPremium} | Highest Reached: ₹${t.highestPremium}`);
        console.log(`   - Max Target Pct     : ${t.pctOfTargetReached}% | Max R:R Reached: 1:${t.maxRRReached}`);
        console.log(`   - Final Exit Reason  : ${t.exitReason}`);
        console.log(`   - Classification     : ${tag}`);
        console.log('-----------------------------------------------------------------------------------');
    });

    console.log("\n===================================================================================");
    console.log("🏆 FINAL TARGET BEHAVIOR & EXCURSION SUMMARY");
    console.log("===================================================================================");
    console.log(`  Total Trades Evaluated           : ${totalTradesChecked}`);
    console.log(`  Target Hit Trades (1:2 R:R)      : ${targetHitCount}`);
    console.log(`  Near-Target Reversals (>= 80%)   : ${nearTargetReversals} Trades (${((nearTargetReversals / totalTradesChecked) * 100).toFixed(1)}%)`);
    console.log(`  Explosive 3x Target Moves (>=1:3): ${reached3xTargetCount} Trades (${((reached3xTargetCount / totalTradesChecked) * 100).toFixed(1)}%)`);
    console.log("===================================================================================");
}

analyzeTargetBehavior().catch(console.error);
