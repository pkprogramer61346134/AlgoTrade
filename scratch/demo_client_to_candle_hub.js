const { candleDataHub } = require('../Candlehub/candleDataHub');
const AlgoTradeWSClient = require('../server/wsClient');

async function runClientToHubDemo() {
    console.log('===========================================================');
    console.log('🚀 DEMO: Other Client (TradeAI) sending message to candleDataHub');
    console.log('===========================================================\n');

    // 1. Initialize & Connect candleDataHub to WebSocket server
    candleDataHub.onWsMessage((msg) => {
        if (msg.type === 'FORWARD_MESSAGE') {
            console.log(`\n📥 [candleDataHub] Received message from "${msg.senderId}":`, msg.payload);

            // Respond back to TradeAI!
            console.log(`📤 [candleDataHub] Sending reply back to "${msg.senderId}"...`);
            candleDataHub.sendWsMessage({
                status: 'SUCCESS',
                info: 'Latest NIFTY_50 5m Candle Data',
                candle: { open: 24500, high: 24550, low: 24480, close: 24540, volume: 95000 }
            }, msg.senderId);
        }
    });

    candleDataHub.connectWebSocket('ws://localhost:8080', 'candleDataHub');
    await new Promise((res) => setTimeout(res, 800));

    // 2. Initialize & Connect External Client (e.g. TradeAI)
    const tradeAIClient = new AlgoTradeWSClient('tradeAI', 'ws://localhost:8080');
    await tradeAIClient.connect();

    tradeAIClient.onMessage((msg) => {
        if (msg.type === 'FORWARD_MESSAGE') {
            console.log(`\n📥 [TradeAI Client] Reply received from "${msg.senderId}":`, msg.payload);
        } else if (msg.type === 'DELIVERY_CONFIRMED') {
            console.log(`✅ [TradeAI Client] Delivery Confirmed! Message delivered to "${msg.deliveredTo}"`);
        }
    });

    await new Promise((res) => setTimeout(res, 500));

    // 3. TradeAI sends a request to candleDataHub
    console.log('\n--- TradeAI Client sending request to candleDataHub ---');
    tradeAIClient.sendMessage({
        action: 'GET_LIVE_CANDLE',
        symbol: 'NIFTY_50',
        interval: '5'
    }, 'candleDataHub');

    await new Promise((res) => setTimeout(res, 1500));

    console.log('\n✅ Demo completed successfully! Closing client sockets...');
    tradeAIClient.close();
    candleDataHub.disconnectWebSocket();
    process.exit(0);
}

runClientToHubDemo();
