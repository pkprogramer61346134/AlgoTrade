const PaperMonitorMessager = require('../papermanager/papermonitormessager');

function testPaperMonitorMessager() {
    console.log("🚀 Testing PaperMonitorMessager Class...\n");

    const mockWsClient = {
        connected: true,
        sendMessage: (msg, target) => {
            console.log(`📡 [MOCK WS SENT] Target: ${target}`);
            console.log("Packet Content:", JSON.stringify(msg, null, 2));
        }
    };

    const messager = new PaperMonitorMessager(mockWsClient);

    const mockPaperState = {
        accountBalance: 12450.00,
        marginUsed: 6500.00,
        todaySummary: { totalTrades: 3, wins: 3, losses: 0, realizedPnl: 2450.00 },
        activePosition: {
            mode: 'PAPER_TRADING',
            symbol: 'NIFTY_23200_PE',
            qty: 65,
            entryPrice: 100.00,
            currentLtp: 125.00,
            initialSL: 85.00,
            targetProfit: 145.00,
            unrealizedPnl: 1625.00,
            highestPriceSeen: 125.00,
            currentTrailingSL: 107.50,
            currentRatioText: '1:1.5'
        }
    };

    console.log("📌 1. Broadcasting Paper Telemetry ('PAPER_ORDER_PLACED')...");
    const success = messager.broadcastTelemetry("PAPER_ORDER_PLACED", { status: "SUCCESS" }, mockPaperState);
    console.log(`Paper Telemetry Sent Success: ${success}\n`);
}

testPaperMonitorMessager();
