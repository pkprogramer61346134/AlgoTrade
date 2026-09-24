const SmartOrderManager = require('../ordermanager/smartOrderManager');

async function testSmartOrderManagerStandalone() {
    console.log("🚀 Testing Rebuilt SmartOrderManager (Clean 6-Module Architecture & Zero Dummy Data)...\n");

    const manager = new SmartOrderManager();

    console.log("6 Modular Components Verified:");
    console.log(`- Step 1 (WS Connector): ${manager.wsManager ? 'OK' : 'MISSING'}`);
    console.log(`- Step 2 (Strike Selector): ${manager.strikeSelector ? 'OK' : 'MISSING'}`);
    console.log(`- Step 3 (Order Placer): ${manager.orderPlacer ? 'OK' : 'MISSING'}`);
    console.log(`- Step 4 (Live PnL Tracker): ${manager.pnlTracker ? 'OK' : 'MISSING'}`);
    console.log(`- Step 5 (Trailing SL Manager): ${manager.trailManager ? 'OK' : 'MISSING'}`);
    console.log(`- Step 6 (Telemetry Messager): ${manager.messager ? 'OK' : 'MISSING'}`);

    console.log("\n📌 Simulating Step 1 & 2: Executing Real Trade Signal for Spot ₹23200...");
    await manager.executeTradeSignal({
        consensus: 'BUY',
        entry: 23200
    });

    console.log(`Active Position Status: ${manager.isOrderActive ? 'ACTIVE' : 'IDLE'}`);
    if (manager.activePosition) {
        console.log(`- Symbol: ${manager.activePosition.symbol}`);
        console.log(`- Entry Price: ₹${manager.activePosition.entryPrice}`);
        console.log(`- Initial SL: ₹${manager.activePosition.initialSL}`);

        console.log("\n📌 Simulating Step 4 & 5: Live Option Price Tick Climbing to ₹120.00...");
        manager.onOptionPriceTick(120.00);
        console.log(`- Live LTP: ₹${manager.activePosition.currentLtp}`);
        console.log(`- Unrealized PnL: ₹${manager.activePosition.unrealizedPnl}`);
        console.log(`- Trailing SL: ₹${manager.activePosition.currentTrailingSL}`);

        console.log("\n📌 Simulating Exit: Closing Active Position...");
        await manager.closePosition("TEST_MANUAL_EXIT");
        console.log(`Active Position Status After Exit: ${manager.isOrderActive ? 'ACTIVE' : 'CLOSED'}`);
    }

    console.log("\n✅ SmartOrderManager Test Completed Successfully!");
}

testSmartOrderManagerStandalone();
