const realTradeEngine = require('./server/realtread/realtread');

async function testVMPos() {
    console.log("=== CALLING START REAL TRADING & SYNC ===");
    await realTradeEngine.startRealTrading();
    await realTradeEngine.syncRealPositionsFromDhan();
    console.log("\n>>> Active position in masterSL AFTER SYNC:", realTradeEngine.activePosition);
    process.exit(0);
}

testVMPos();
