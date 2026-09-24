const PaperOrderManager = require('../papermanager/paperOrderManager');
const SmartOrderManager = require('../ordermanager/smartOrderManager');

async function testManagersWithRealDhan() {
    console.log("=================================================");
    console.log("Testing PaperOrderManager & SmartOrderManager with real Dhan Option Data...");
    console.log("=================================================");

    const paperMgr = new PaperOrderManager();
    const smartMgr = new SmartOrderManager();

    const mockSignal = {
        consensus: 'BUY',
        entry: 23436.50,
        time: new Date().toLocaleTimeString()
    };

    console.log("\n1. Testing Paper Order Entry with BUY signal at Nifty spot 23436.50...");
    await paperMgr.handleConsensusSignal(mockSignal, 'consensusEngine');

    if (paperMgr.activePosition) {
        console.log("\nPaper Active Position created successfully!");
        console.log(JSON.stringify(paperMgr.activePosition, null, 2));

        console.log("\n2. Simulating Spot Tick update (spot = 23450.00)...");
        await paperMgr.onSpotPriceTick(23450.00);
        console.log("Updated Paper Active Position LTP:", paperMgr.activePosition.currentLtp, "Unrealized PnL: ₹" + paperMgr.activePosition.unrealizedPnl);

        console.log("\n3. Closing Paper Position...");
        paperMgr.closePaperPosition("TEST_FINISHED");
    } else {
        console.error("Paper active position was NOT created!");
    }

    console.log("\n-------------------------------------------------");
    console.log("4. Testing Smart Order Entry with BUY signal at Nifty spot 23436.50...");
    await smartMgr.handleConsensusSignal(mockSignal, 'consensusEngine');

    if (smartMgr.activePosition) {
        console.log("\nSmart Active Position created successfully!");
        console.log(JSON.stringify(smartMgr.activePosition, null, 2));

        console.log("\n5. Simulating Spot Tick update (spot = 23450.00)...");
        await smartMgr.onSpotPriceTick(23450.00);
        console.log("Updated Smart Active Position LTP:", smartMgr.activePosition.currentLtp, "Unrealized PnL: ₹" + smartMgr.activePosition.unrealizedPnl);
    } else {
        console.error("Smart active position was NOT created!");
    }
}

testManagersWithRealDhan();
