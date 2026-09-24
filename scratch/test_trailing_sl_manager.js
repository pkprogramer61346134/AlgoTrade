const TrailingSLManager = require('../ordermanager/trailingslmanager');

function testTrailingSLManager() {
    console.log("🚀 Testing TrailingSLManager Class...\n");

    const trailManager = new TrailingSLManager();

    // Mock Position
    const mockPosition = {
        symbol: 'NIFTY_23200_PE',
        entryPrice: 100.00,
        riskPoints: 15.00,
        initialSL: 85.00,
        currentTrailingSL: 85.00,
        targetProfit: 160.00,
        highestPriceSeen: 100.00,
        currentMilestoneIndex: -1,
        currentRatioText: '1:0'
    };

    console.log("Initial Position State:");
    console.log(`- Entry: ₹${mockPosition.entryPrice} | Risk: 15 pts | Initial SL: ₹${mockPosition.currentTrailingSL}`);

    const testTicks = [110, 123, 138, 155, 135, 120];

    for (const tick of testTicks) {
        console.log(`\n📌 Price Tick: ₹${tick}`);
        const result = trailManager.evaluateTrailingSL(mockPosition, tick);
        console.log(`- Highest Price Seen: ₹${mockPosition.highestPriceSeen}`);
        console.log(`- Milestone: ${mockPosition.currentRatioText} | Trailing SL: ₹${mockPosition.currentTrailingSL}`);

        const exitReason = trailManager.checkExitTriggers(mockPosition, tick);
        if (exitReason) {
            console.log(`🚨 Exit Triggered: ${exitReason}`);
            break;
        }
    }

    console.log("\n✅ TrailingSLManager Test Completed Successfully!");
}

testTrailingSLManager();
