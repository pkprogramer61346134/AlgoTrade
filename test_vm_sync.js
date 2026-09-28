const realTradeEngine = require('./server/realtread/realtread');

async function runVMSync() {
    console.log("=== VM SYNC TEST ===");
    await realTradeEngine.startRealTrading();
    await realTradeEngine.syncRealPositionsFromDhan();
    console.log("Active position in masterSL:", realTradeEngine.activePosition);
    process.exit(0);
}

runVMSync();
