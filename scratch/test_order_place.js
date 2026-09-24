const OrderPlace = require('../ordermanager/orderplace');

async function testOrderPlace() {
    const orderPlacer = new OrderPlace();
    console.log("Testing OrderPlace class...");

    const mockDetails = {
        symbol: "NIFTY_23200_PE",
        securityId: "73911",
        liveLtp: 100.0,
        optionType: "PE",
        strikePrice: 23200,
        qty: 65
    };

    try {
        console.log("\n1. Testing updateTrailingSl function...");
        let activePos = {
            orderId: "TEST_123",
            symbol: mockDetails.symbol,
            securityId: mockDetails.securityId,
            qty: 65,
            entryPrice: 100.0,
            currentLtp: 100.0,
            initialSL: 85.0,
            currentTrailingSL: 85.0,
            targetProfit: 133.0,
            highestPriceSeen: 100.0,
            riskPoints: 15.0,
            currentMilestoneIndex: -1,
            currentRatioText: "1:0"
        };

        activePos = orderPlacer.updateTrailingSl(activePos, 125.0); // 1:1.66 RR gained
        console.log("Updated Position Trailing SL:", activePos.currentTrailingSL, "| Milestone:", activePos.currentRatioText);

        console.log("\n2. OrderPlace class methods initialized successfully!");
    } catch (e) {
        console.error("Test Error:", e.message);
    }
}

testOrderPlace();
