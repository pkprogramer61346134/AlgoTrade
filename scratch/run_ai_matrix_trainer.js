/**
 * Runner Script for 5-Engine Machine Learning Weighted Matrix Trainer
 */

const path = require('path');
const fs = require('fs');
const ConsensusMatrixTrainer = require('../src/consensusMatrixTrainer');

function runMatrixTrainerProcess() {
    console.log("=========================================================================================");
    console.log("🤖 5-ENGINE NEURAL WEIGHT MATRIX AI TRAINER");
    console.log("   Perceptron Gradient & Reinforcement Learning for Consensus Engines");
    console.log("=========================================================================================\n");

    const trainer = new ConsensusMatrixTrainer({
        initialCapital: 100000,
        learningRate: 0.05,
        epochs: 10
    });

    const report = trainer.train();

    console.log("\n=========================================================================================");
    console.log("🏆 BEST TRAINED SUB-ENGINE WEIGHT MATRIX");
    console.log("=========================================================================================");
    const bw = report.bestWeights;
    console.log(`🔹 Engine 1 (Volume Surge)        : Weight w1 = ${bw.w1} (${(bw.w1*100).toFixed(1)}%)`);
    console.log(`🔹 Engine 2 (RSI Velocity)        : Weight w2 = ${bw.w2} (${(bw.w2*100).toFixed(1)}%)`);
    console.log(`🔹 Engine 3 (EMA 50 Trend)        : Weight w3 = ${bw.w3} (${(bw.w3*100).toFixed(1)}%)`);
    console.log(`🔹 Engine 4 (VWAP Benchmark)      : Weight w4 = ${bw.w4} (${(bw.w4*100).toFixed(1)}%)`);
    console.log(`🔹 Engine 5 (Supertrend & Rejection): Weight w5 = ${bw.w5} (${(bw.w5*100).toFixed(1)}%)`);
    console.log("-----------------------------------------------------------------------------------------");

    const bestEpoch = report.bestEpochReport;
    console.log(`💰 Net Realized PnL  : ${bestEpoch.netPnL >= 0 ? '+' : ''}₹${bestEpoch.netPnL.toLocaleString()} (${bestEpoch.returnPct}%)`);
    console.log(`🟢 Win Rate          : ${bestEpoch.winRate}% (${bestEpoch.wins} Wins / ${bestEpoch.losses} Losses)`);
    console.log(`📉 Max Drawdown      : ${bestEpoch.maxDrawdown}%`);
    console.log("-----------------------------------------------------------------------------------------\n");

    // Overwrite strategy config with best matrix weights
    const configPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.engineWeights = bw;
        config.weightedThreshold = 0.55;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`✅ Applied Optimal AI Neural Matrix Weights to strategies_config/consensus_master_head.json!\n`);
    }
}

runMatrixTrainerProcess();
