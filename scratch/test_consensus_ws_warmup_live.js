const { candleDataHub } = require('../Candlehub/candleDataHub');
const { consensusService } = require('../head/consensusEngine');
const AlgoTradeWSClient = require('../server/wsClient');
const { loadAllCandlesFromDir, getCandleDataDir } = require('../indicators/utils/dataLoader');

async function testConsensusWSWarmupLive() {
    console.log('===========================================================');
    console.log('🧪 TESTING: ConsensusEngine -> WebSocket -> CandleDataHub Warmup Fetch');
    console.log('===========================================================\n');

    // Step 1: Connect candleDataHub to WebSocket Server
    console.log('1️⃣ Starting & Connecting candleDataHub Service over WS...');
    candleDataHub.connectWebSocket('ws://localhost:8080', 'candleDataHub');
    await new Promise((res) => setTimeout(res, 800));

    // Step 2: Connect consensusEngine to WebSocket Server
    console.log('\n2️⃣ Starting & Connecting consensusEngine Service over WS...');
    consensusService.connect('ws://localhost:8080', 'consensusEngine');
    await new Promise((res) => setTimeout(res, 800));

    // Step 3: Connect External Client ("LiveClient_Delta")
    console.log('\n3️⃣ Connecting External Client ("LiveClient_Delta")...');
    const liveClient = new AlgoTradeWSClient('LiveClient_Delta', 'ws://localhost:8080');
    await liveClient.connect();

    const allCandles = loadAllCandlesFromDir(getCandleDataDir());
    const shortCandles = allCandles.slice(100, 105); // Only 5 candles!

    liveClient.onMessage((msg) => {
        if (msg.type === 'FORWARD_MESSAGE' && msg.payload.action === 'CONSENSUS_SIGNAL_RESPONSE') {
            console.log('\n📥 [LiveClient_Delta] Received Final Single Consensus Signal Response:');
            console.log(JSON.stringify(msg.payload.singleSignal, null, 2));
        }
    });

    await new Promise((res) => setTimeout(res, 500));

    // Step 4: LiveClient_Delta sends 5 candles to consensusEngine over WebSocket
    console.log(`\n4️⃣ [LiveClient_Delta] Sending ${shortCandles.length} candles (Date: ${shortCandles[0].date}) to "consensusEngine" over WS...`);
    liveClient.sendMessage({
        action: 'EVALUATE_CONSENSUS',
        candles: shortCandles
    }, 'consensusEngine');

    await new Promise((res) => setTimeout(res, 3000));

    console.log('\n===========================================================');
    console.log('✅ LIVE WEBSOCKET WARMUP FETCH TEST PASSED SUCCESSFULLY!');
    console.log('===========================================================');

    liveClient.close();
    candleDataHub.disconnectWebSocket();
    process.exit(0);
}

testConsensusWSWarmupLive();
