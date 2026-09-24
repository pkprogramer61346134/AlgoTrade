const PaperOrderManager = require('../papermanager/paperOrderManager');

async function testPaperOrderManagerStandalone() {
    console.log("🚀 Testing Rebuilt PaperOrderManager (Virtual Orders + Real Dhan Market Data)...\n");

    const paperManager = new PaperOrderManager();

    console.log("5 Modular Components Integrated:");
    console.log(`- WS Manager: ${paperManager.wsManager ? 'OK' : 'MISSING'}`);
    console.log(`- Strike Selector: ${paperManager.strikeSelector ? 'OK' : 'MISSING'}`);
    console.log(`- Live PnL Tracker: ${paperManager.pnlTracker ? 'OK' : 'MISSING'}`);
    console.log(`- Trailing SL Manager: ${paperManager.trailManager ? 'OK' : 'MISSING'}`);
    console.log(`- Monitor Messager: ${paperManager.messager ? 'OK' : 'MISSING'}`);

    console.log("\n📌 Simulating Signal: Executing Paper Trade Signal for Spot ₹23200...");
    await paperManager.executePaperTradeSignal({
        consensus: 'BUY',
        entry: 23200
    });

    console.log(`Paper Active Position Status: ${paperManager.isOrderActive ? 'ACTIVE' : 'IDLE'}`);
    if (paperManager.activePosition) {
        console.log(`- Selected Symbol: ${paperManager.activePosition.symbol}`);
        console.log(`- Strike Price: ₹${paperManager.activePosition.strikePrice}`);
        console.log(`- Real Dhan Entry Premium: ₹${paperManager.activePosition.entryPrice}`);
        console.log(`- Initial SL: ₹${paperManager.activePosition.initialSL}`);

        console.log("\n📌 Simulating Option Price Tick Climbing to ₹18.50...");
        paperManager.onOptionPriceTick(18.50);
        
        if (paperManager.activePosition) {
            console.log(`- Live LTP: ₹${paperManager.activePosition.currentLtp}`);
            console.log(`- Virtual PnL: ₹${paperManager.activePosition.unrealizedPnl}`);
            console.log(`- Trailing SL: ₹${paperManager.activePosition.currentTrailingSL}`);

            console.log("\n📌 Closing Paper Position...");
            await paperManager.closePaperPosition("TEST_PAPER_EXIT");
        }
        
        console.log(`Paper Position Status After Exit: ${paperManager.isOrderActive ? 'ACTIVE' : 'CLOSED'}`);
    }

    console.log("\n✅ PaperOrderManager Test Completed Successfully!");
}

testPaperOrderManagerStandalone();
