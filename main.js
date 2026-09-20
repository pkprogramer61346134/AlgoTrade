const readline = require('readline');
const { runHistoricalBacktestMode } = require('./src/historicalRunner');
const { runLiveMarketMode } = require('./src/liveMarketRunner');
const { loadAllStrategiesFromJSON, CONFIG_DIR } = require('./src/strategyLoader');

function showHeader() {
    console.log("\n=========================================================================================");
    console.log("🚀 ALGOTRADE SYSTEM - DYNAMIC JSON STRATEGY ENGINE");
    console.log("=========================================================================================");
    console.log(`📁 Strategies Directory: ${CONFIG_DIR}`);
    console.log(`⚙️ Order Manager Connected: order_config/orderExecutionManager.js (Capital % & Trailing SL)`);

    const strategies = loadAllStrategiesFromJSON();
    console.log(`✅ Loaded ${strategies.length} Dynamic JSON Strategies:`);
    strategies.forEach((s, idx) => console.log(`   ${idx + 1}. [${s.id}] ${s.name}`));
    console.log("=========================================================================================\n");
}

function promptOptions() {
    showHeader();

    console.log("Please select Execution Mode:");
    console.log("  [1] Option 1: Historical Data Mode (Backtest over Candle Dataset)");
    console.log("  [2] Option 2: Live Market Signal Alert Only (Order Switch: 🔴 OFF)");
    console.log("  [3] Option 3: Live Market Real Trading Mode (Order Switch: 🟢 ON)\n");

    const args = process.argv.slice(2);
    if (args[0] === '1') {
        runHistoricalBacktestMode();
        return;
    } else if (args[0] === '2') {
        runLiveMarketMode(false); // Order Switch OFF
        return;
    } else if (args[0] === '3') {
        runLiveMarketMode(true);  // Order Switch ON
        return;
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question("Enter Option (1, 2, or 3): ", (answer) => {
        rl.close();
        const choice = answer.trim();

        if (choice === '1') {
            runHistoricalBacktestMode();
        } else if (choice === '2') {
            runLiveMarketMode(false); // Order Switch OFF
        } else if (choice === '3') {
            runLiveMarketMode(true);  // Order Switch ON
        } else {
            console.log("⚠️ Invalid choice. Defaulting to Option 2: Live Market Signal Only (Order Switch OFF)...\n");
            runLiveMarketMode(false);
        }
    });
}

if (require.main === module) {
    promptOptions();
}

module.exports = { promptOptions };
