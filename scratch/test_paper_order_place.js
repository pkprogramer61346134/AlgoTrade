const PaperOrderPlace = require('../papermanager/paperorderplace');

function testPaperOrderPlace() {
    console.log("🚀 Testing PaperOrderPlace Class...\n");

    const paperPlacer = new PaperOrderPlace();

    const mockStrike = {
        symbol: 'NIFTY_23200_PE',
        securityId: '73911',
        strikePrice: 23200,
        optionType: 'PE',
        liveLtp: 102.50,
        qty: 65,
        requiredMargin: 6662.50
    };

    // 1. Place Paper Order
    console.log("📌 1. Placing Paper BUY Order...");
    const activePos = paperPlacer.placePaperOrder(mockStrike, 15.0, 2.2);
    console.log("Active Position Result:", JSON.stringify(activePos, null, 2));

    // 2. Close Paper Order
    console.log("\n📌 2. Closing Paper Order...");
    activePos.currentLtp = 125.00;
    const closedRecord = paperPlacer.closePaperOrder(activePos, "TARGET_PROFIT_HIT");
    console.log("Closed Record Result:", JSON.stringify(closedRecord, null, 2));

    console.log("\n✅ PaperOrderPlace Test Completed Successfully!");
}

testPaperOrderPlace();
