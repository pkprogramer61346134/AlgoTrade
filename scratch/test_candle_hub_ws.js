const { candleDataHub } = require('../Candlehub/candleDataHub');

async function testCandleDataHubWS() {
    console.log('--- TESTING CandleDataHub WebSocket Integration ---');

    // 1. Listen for WebSocket messages
    candleDataHub.onWsMessage((msg) => {
        console.log('📩 [Test Component] Received WS Message:', JSON.stringify(msg));
    });

    // 2. Connect to local server
    candleDataHub.connectWebSocket('ws://localhost:8080', 'candleDataHub_Tester');

    await new Promise((res) => setTimeout(res, 1000));

    // 3. Send test message to another client or server
    console.log('📤 [Test Component] Broadcasting live candle update...');
    candleDataHub.broadcastCandle({
        symbol: 'NIFTY_50',
        date: '2026-09-22',
        time: '15:30',
        open: 24500,
        high: 24550,
        low: 24490,
        close: 24540,
        volume: 125000
    });

    await new Promise((res) => setTimeout(res, 1500));

    console.log('✅ CandleDataHub WS test complete!');
    candleDataHub.disconnectWebSocket();
    process.exit(0);
}

testCandleDataHubWS();
