/**
 * Train on 2024-2025 (In-Sample) ➔ Test on 2026 (Out-of-Sample)
 * Machine Learning AI Validation Runner for Master Head Consensus Strategy.
 */

const fs = require('fs');
const path = require('path');
const ConsensusMatrixTrainer = require('../src/consensusMatrixTrainer');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function runTrain2024_2025_Test2026() {
    console.log("=========================================================================================");
    console.log("🎓 IN-SAMPLE TRAINER & OUT-OF-SAMPLE TESTER (AI VALIDATION ENGINE)");
    console.log("   Training Set : 2024 ➔ 2025 Historical Data (In-Sample)");
    console.log("   Testing Set  : 2026 Unseen Market Data (Out-of-Sample)");
    console.log("=========================================================================================\n");

    const candleDir = path.join(__dirname, '../candle_data');
    const files = fs.readdirSync(candleDir).filter(f => f.endsWith('.json') && f.startsWith('NIFTY_50_5_'));

    let trainCandles = [];
    let testCandles = [];

    for (const file of files) {
        const filePath = path.join(candleDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        for (const c of data) {
            if (!c.date) continue;
            const year = parseInt(c.date.substring(0, 4));
            if (year < 2026) {
                trainCandles.push(c);
            } else {
                testCandles.push(c);
            }
        }
    }

    // Sort chronologically
    trainCandles.sort((a, b) => a.timestamp - b.timestamp);
    testCandles.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`📁 In-Sample Training Dataset (2024-2025) : ${trainCandles.length} Candles`);
    console.log(`📁 Out-of-Sample Testing Dataset (2026)     : ${testCandles.length} Candles\n`);

    if (trainCandles.length === 0 || testCandles.length === 0) {
        console.error("❌ Dataset empty. Please check candle files.");
        return;
    }

    // Save temporary training file
    const tempTrainPath = path.join(__dirname, '../scratch/train_2024_2025_candles.json');
    fs.writeFileSync(tempTrainPath, JSON.stringify(trainCandles));

    // =========================================================================================
    // PHASE 1: TRAIN WEIGHT MATRIX ON IN-SAMPLE DATA (2024 - 2025)
    // =========================================================================================
    console.log("=========================================================================================");
    console.log("🧠 PHASE 1: TRAINING NEURAL WEIGHT MATRIX ON 2024-2025 IN-SAMPLE DATA");
    console.log("=========================================================================================");

    const trainer = new ConsensusMatrixTrainer({
        initialCapital: 100000,
        datasetPath: tempTrainPath,
        learningRate: 0.05,
        epochs: 5
    });

    const trainingResult = trainer.train();
    const trainedWeights = trainingResult.bestWeights;

    console.log("\n=========================================================================================");
    console.log("🏆 OPTIMAL WEIGHT MATRIX LEARNED FROM 2024-2025 TRAINING DATA");
    console.log("=========================================================================================");
    console.log(`🔹 Engine 1 (Volume Surge)        : Weight w1 = ${trainedWeights.w1} (${(trainedWeights.w1*100).toFixed(1)}%)`);
    console.log(`🔹 Engine 2 (RSI Velocity)        : Weight w2 = ${trainedWeights.w2} (${(trainedWeights.w2*100).toFixed(1)}%)`);
    console.log(`🔹 Engine 3 (EMA 50 Trend)        : Weight w3 = ${trainedWeights.w3} (${(trainedWeights.w3*100).toFixed(1)}%)`);
    console.log(`🔹 Engine 4 (VWAP Benchmark)      : Weight w4 = ${trainedWeights.w4} (${(trainedWeights.w4*100).toFixed(1)}%)`);
    console.log(`🔹 Engine 5 (Supertrend & Rejection): Weight w5 = ${trainedWeights.w5} (${(trainedWeights.w5*100).toFixed(1)}%)`);
    console.log("-----------------------------------------------------------------------------------------\n");

    // =========================================================================================
    // PHASE 2: TEST TRAINED MATRIX ON UNSEEN OUT-OF-SAMPLE DATA (2026)
    // =========================================================================================
    console.log("=========================================================================================");
    console.log("🧪 PHASE 2: TESTING LEARNED WEIGHT MATRIX ON UNSEEN 2026 MARKET DATA");
    console.log("=========================================================================================");

    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const testConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));
    testConfig.engineWeights = trainedWeights;
    testConfig.weightedThreshold = 0.55;

    let runningCapital = 100000;
    let peakCapital = 100000;
    let maxDrawdown = 0;
    let activeTrade = null;
    const completedTrades = [];
    const monthlySummary = {};
    const dailyTradeCounts = {};

    console.log("⚡ Pre-computing indicator series for 2026 test candles...");
    const globalTestData = prepareJSONStrategyData(testCandles, testConfig);

    for (let i = 0; i < testCandles.length; i++) {
        const c = testCandles[i];
        const monthKey = c.date ? c.date.substring(0, 7) : "Unknown";

        if (!monthlySummary[monthKey]) {
            monthlySummary[monthKey] = { trades: 0, wins: 0, losses: 0, pnl: 0, startCap: runningCapital };
        }

        // Manage Position
        if (activeTrade) {
            const currentPrem = activeTrade.optionType === "CE"
                ? activeTrade.optionPremiumPrice + (c.close - activeTrade.spotEntryPrice) * 0.5
                : activeTrade.optionPremiumPrice + (activeTrade.spotEntryPrice - c.close) * 0.5;

            const isCEHitSL = activeTrade.optionType === "CE" && c.low <= activeTrade.spotSL;
            const isCEHitTP = activeTrade.optionType === "CE" && c.high >= activeTrade.spotTarget;
            const isPEHitSL = activeTrade.optionType === "PE" && c.high >= activeTrade.spotSL;
            const isPEHitTP = activeTrade.optionType === "PE" && c.low <= activeTrade.spotTarget;

            let exitReason = null;
            let exitPrice = c.close;
            let exitPremium = currentPrem;

            if (isCEHitSL || isPEHitSL) {
                exitReason = "SL HIT";
                exitPrice = activeTrade.spotSL;
                exitPremium = activeTrade.optionSL;
            } else if (isCEHitTP || isPEHitTP) {
                exitReason = "TARGET HIT";
                exitPrice = activeTrade.spotTarget;
                exitPremium = activeTrade.target;
            } else if (c.time >= "15:00") {
                exitReason = "3:00 PM EOD";
                exitPrice = c.close;
                exitPremium = currentPrem;
            }

            if (exitReason) {
                const ptsPnl = Number((exitPremium - activeTrade.optionPremiumPrice).toFixed(2));
                const rupeePnl = Number((ptsPnl * activeTrade.quantity).toFixed(2));
                runningCapital += rupeePnl;

                if (runningCapital > peakCapital) peakCapital = runningCapital;
                const dd = peakCapital > 0 ? ((peakCapital - runningCapital) / peakCapital) * 100 : 0;
                if (dd > maxDrawdown) maxDrawdown = dd;

                monthlySummary[monthKey].trades++;
                if (rupeePnl >= 0) monthlySummary[monthKey].wins++;
                else monthlySummary[monthKey].losses++;
                monthlySummary[monthKey].pnl += rupeePnl;

                completedTrades.push({ rupeePnl, ptsPnl, isWin: rupeePnl >= 0, exitReason });
                activeTrade = null;
            }
        }

        // Evaluate Signal
        const result = evaluateConsensusEngine(testCandles, i, testConfig, globalTestData, dailyTradeCounts);
        if (result.type !== "NONE" && !activeTrade) {
            const optionType = result.type === "BUY" ? "CE" : "PE";
            const spotPrice = c.close;
            const NIFTY_LOT_SIZE = 65;
            const estPremium = Math.max(80, Math.min(250, spotPrice * 0.005));
            const lotCapCapital = Math.max(25000, runningCapital);
            const numLots = Math.max(1, Math.min(10, Math.floor(lotCapCapital / (estPremium * NIFTY_LOT_SIZE))));
            const qty = numLots * NIFTY_LOT_SIZE;

            const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
                spotPrice,
                signalType: result.type,
                stopLoss: result.stopLoss,
                targetPrice: result.targetPrice,
                riskRewardRatio: testConfig.riskRewardRatio || 2.0
            });

            const deltaMap = SpotRiskDeltaCalculator.mapSpotToOptionDelta({
                spotPrice,
                spotSL: spotStruct.spotSL,
                spotTarget: spotStruct.spotTarget,
                optionPremiumPrice: estPremium,
                optionType,
                delta: 0.50
            });

            activeTrade = {
                entryTime: c.time,
                optionType,
                spotEntryPrice: spotPrice,
                spotSL: spotStruct.spotSL,
                spotTarget: spotStruct.spotTarget,
                optionPremiumPrice: Number(estPremium.toFixed(2)),
                optionSL: Number(deltaMap.optionSL.toFixed(2)),
                target: Number(deltaMap.optionTarget.toFixed(2)),
                quantity: qty
            };

            dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;
        }
    }

    console.log("=========================================================================================");
    console.log("📅 2026 UNSEEN TEST DATASET - MONTH-BY-MONTH PERFORMANCE BREAKDOWN");
    console.log("=========================================================================================");

    const monthTable = Object.keys(monthlySummary).map(m => {
        const s = monthlySummary[m];
        const winRate = s.trades > 0 ? Number(((s.wins / s.trades) * 100).toFixed(1)) : 0;
        const returnPct = s.startCap > 0 ? Number(((s.pnl / s.startCap) * 100).toFixed(1)) : 0;
        return {
            "Month": m,
            "Trades": s.trades,
            "Wins": s.wins,
            "Losses": s.losses,
            "Win Rate": `${winRate}%`,
            "Monthly PnL (₹)": `${s.pnl >= 0 ? '+' : ''}₹${s.pnl.toLocaleString()}`,
            "Monthly Return": `${returnPct >= 0 ? '+' : ''}${returnPct}%`
        };
    });

    console.table(monthTable);

    const totalTrades = completedTrades.length;
    const totalWins = completedTrades.filter(t => t.isWin).length;
    const totalLosses = totalTrades - totalWins;
    const winRate = totalTrades > 0 ? Number(((totalWins / totalTrades) * 100).toFixed(1)) : 0;
    const netPnL = Number((runningCapital - 100000).toFixed(2));

    console.log("\n=========================================================================================");
    console.log("🏆 FINAL OUT-OF-SAMPLE (2026) AI TEST PERFORMANCE SUMMARY");
    console.log("=========================================================================================");
    console.log(`💼 Starting Capital     : ₹100,000`);
    console.log(`💰 Final Ending Capital : ₹${runningCapital.toLocaleString()}`);
    console.log(`💵 Net Realized PnL    : ${netPnL >= 0 ? '+' : ''}₹${netPnL.toLocaleString()} (${((netPnL/100000)*100).toFixed(2)}%)`);
    console.log(`📊 Total 2026 Trades   : ${totalTrades}`);
    console.log(`🟢 Winning Trades      : ${totalWins}`);
    console.log(`🔴 Losing Trades       : ${totalLosses}`);
    console.log(`🎯 2026 Win Rate       : ${winRate}%`);
    console.log(`📉 Maximum Drawdown    : ${maxDrawdown.toFixed(2)}%`);
    console.log("-----------------------------------------------------------------------------------------\n");
}

runTrain2024_2025_Test2026();
