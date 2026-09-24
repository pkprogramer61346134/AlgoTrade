const MonitorMessager = require('../ordermanager/monitormessager');

function testMonitorMessager() {
    console.log("🚀 Testing MonitorMessager Class...\n");

    // Mock WebSocket Client
    const mockWsClient = {
        connected: true,
        sendMessage: (msg, target) => {
            console.log(`📡 [MOCK WS SENT] Target: ${target}`);
            console.log("Packet Content:", JSON.stringify(msg, null, 2));
        }
    };

    const messager = new MonitorMessager(mockWsClient);

    // Mock State Data
    const mockState = {
        accountBalance: 15420.50,
        marginUsed: 6500.00,
        todaySummary: { totalTrades: 5, wins: 4, losses: 1, realizedPnl: 2450.00 },
        activePosition: {
            symbol: 'NIFTY_23200_PE',
            qty: 65,
            entryPrice: 100.00,
            currentLtp: 112.50,
            initialSL: 85.00,
            targetProfit: 150.00,
            unrealizedPnl: 812.50,
            highestPriceSeen: 112.50,
            currentTrailingSL: 100.00,
            currentRatioText: '1:1.5'
        }
    };

    // 1. Test broadcastTelemetry
    console.log("📌 1. Broadcasting Telemetry Event ('LIVE_TICK_UPDATE')...");
    const success = messager.broadcastTelemetry("LIVE_TICK_UPDATE", { tick: 112.50 }, mockState);
    console.log(`Telemetry Sent Success: ${success}\n`);

    // 2. Test sendDirectMessage
    console.log("📌 2. Sending Direct Custom Message...");
    messager.sendDirectMessage("ALERT_NOTIFICATION", { message: "Target hit successfully!" });
}

testMonitorMessager();
