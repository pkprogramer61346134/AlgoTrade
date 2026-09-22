const { candleDataHub } = require('./candleDataHub');
const AlgoTradeWSClient = require('../server/wsClient');

async function testCandleHubClient() {
    console.log('===========================================================');
    console.log('🧪 TESTING: CandleHub Date Range & Multi-Interval Requests');
    console.log('===========================================================\n');

    // Step 1: Initialize candleDataHub WebSocket Connection
    console.log('1️⃣ Connecting candleDataHub to WebSocket Server...');
    candleDataHub.connectWebSocket('ws://localhost:8080', 'candleDataHub');
    await new Promise((res) => setTimeout(res, 800));

    // Step 2: Create External Strategy Client ("StrategyClient_Alpha")
    console.log('\n2️⃣ Connecting External Client ("StrategyClient_Alpha")...');
    const strategyClient = new AlgoTradeWSClient('StrategyClient_Alpha', 'ws://localhost:8080');
    await strategyClient.connect();

    let responseCount = 0;

    strategyClient.onMessage((msg) => {
        if (msg.type === 'FORWARD_MESSAGE') {
            const payload = msg.payload;
            if (payload && payload.action === 'CANDLE_DATA_RESPONSE') {
                responseCount++;
                console.log(`\n📥 [StrategyClient_Alpha] Received Candle Data Response #${responseCount}:`);
                console.log(`   - Status: ${payload.status}`);
                console.log(`   - Symbol: ${payload.symbol}`);
                console.log(`   - Date Range: ${payload.startDate} to ${payload.endDate}`);
                console.log(`   - Interval: ${payload.interval} min`);
                console.log(`   - Total Candles Received: ${payload.count}`);
                if (payload.candles && payload.candles.length > 0) {
                    console.log(`   - First Candle:`, payload.candles[0]);
                    console.log(`   - Last Candle: `, payload.candles[payload.candles.length - 1]);
                }
            }
        }
    });

    await new Promise((res) => setTimeout(res, 500));

    // Step 3: Client requests candles for a specific Date Range with 5-minute interval
    console.log('\n3️⃣ [StrategyClient_Alpha] Requesting 5-Min Candles (2026-09-01 to 2026-09-03)...');
    strategyClient.sendMessage({
        action: 'GET_CANDLES',
        symbol: 'NIFTY_50',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        interval: '5'
    }, 'candleDataHub');

    await new Promise((res) => setTimeout(res, 1500));

    // Step 4: Client requests candles for Date Range with 15-minute interval
    console.log('\n4️⃣ [StrategyClient_Alpha] Requesting 15-Min Candles (2026-09-01 to 2026-09-05)...');
    strategyClient.sendMessage({
        action: 'GET_CANDLES',
        symbol: 'NIFTY_50',
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        interval: '15'
    }, 'candleDataHub');

    await new Promise((res) => setTimeout(res, 1500));

    // Step 5: Test 1-Minute Interval request
    console.log('\n5️⃣ [StrategyClient_Alpha] Requesting 1-Min Candles (2026-09-01)...');
    strategyClient.sendMessage({
        action: 'GET_CANDLES',
        symbol: 'NIFTY_50',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        interval: '1'
    }, 'candleDataHub');

    await new Promise((res) => setTimeout(res, 1500));

    console.log('\n===========================================================');
    console.log(`✅ ALL DATE RANGE & MULTI-INTERVAL TESTS COMPLETED (${responseCount} responses received)!`);
    console.log('===========================================================');

    strategyClient.close();
    candleDataHub.disconnectWebSocket();
    process.exit(0);
}

testCandleHubClient();
