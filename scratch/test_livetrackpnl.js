const LiveTrackPnL = require('../ordermanager/livetrackpnl');

async function testLiveTrackPnL() {
    console.log("🚀 Testing LiveTrackPnL Class...\n");
    const tracker = new LiveTrackPnL();

    // 1. Test fetchDhanLivePosition
    console.log("📌 1. Calling fetchDhanLivePosition()...");
    const dhanPos = await tracker.fetchDhanLivePosition();
    console.log("Dhan Live Position Output:", JSON.stringify(dhanPos, null, 2));

    // 2. Test fetchLiveOptionLtp
    console.log("\n📌 2. Calling fetchLiveOptionLtp(23200, 'PE')...");
    const liveLtp = await tracker.fetchLiveOptionLtp(23200, 'PE');
    console.log("Live Option LTP Output:", liveLtp);

    // 3. Test calculateLivePnL
    console.log("\n📌 3. Calling calculateLivePnL()...");
    const mockPosition = {
        symbol: 'NIFTY_23200_PE',
        entryPrice: 100.00,
        qty: 65,
        riskPoints: 15.00,
        highestPriceSeen: 105.00
    };
    const currentPrice = 112.50;
    const pnlMetrics = tracker.calculateLivePnL(mockPosition, currentPrice);
    console.log("Calculated Live PnL Output:", JSON.stringify(pnlMetrics, null, 2));
}

testLiveTrackPnL();
