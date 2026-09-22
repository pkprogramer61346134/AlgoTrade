const LiveTickClient = require('../live/liveTickClient');
const { candleDataHub } = require('../Candlehub/candleDataHub');
const { consensusService } = require('../head/consensusEngine');

async function testLiveClientToConsensus() {
    console.log('===========================================================');
    console.log('🧪 TESTING: LiveTickClient -> WebSocket -> consensusEngine.js Integration');
    console.log('===========================================================\n');

    // Step 1: Connect CandleDataHub Service over WS
    console.log('1️⃣ Starting & Connecting candleDataHub over WS...');
    candleDataHub.connectWebSocket('ws://localhost:8080', 'candleDataHub');
    await new Promise((res) => setTimeout(res, 800));

    // Step 2: Connect ConsensusEngine Service over WS
    console.log('\n2️⃣ Starting & Connecting consensusEngine over WS...');
    consensusService.connect('ws://localhost:8080', 'consensusEngine');
    await new Promise((res) => setTimeout(res, 800));

    // Step 3: Initialize LiveTickClient assigned to consensusEngine
    console.log('\n3️⃣ Starting LiveTickClient assigned to "consensusEngine"...');
    const liveClient = new LiveTickClient({
        symbol: 'NIFTY_50',
        targetClient: 'consensusEngine'
    });

    await liveClient.init();

    // Step 4: Simulate Live Market Ticks
    console.log('\n4️⃣ Starting Live Market Ticks for NIFTY_50 (10 ticks)...');
    liveClient.startLiveStream(24500);

    // Let it stream for 8 seconds
    await new Promise((res) => setTimeout(res, 8000));

    console.log('\n===========================================================');
    console.log('✅ LIVE TICK CLIENT TO CONSENSUS ENGINE TEST COMPLETED SUCCESSFULLY!');
    console.log('===========================================================');

    liveClient.stopLiveStream();
    candleDataHub.disconnectWebSocket();
    process.exit(0);
}

testLiveClientToConsensus();
