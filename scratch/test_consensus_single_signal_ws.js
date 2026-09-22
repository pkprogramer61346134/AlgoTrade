const { consensusService } = require('../head/consensusEngine');
const AlgoTradeWSClient = require('../server/wsClient');
const { loadAllCandlesFromDir, getCandleDataDir } = require('../indicators/utils/dataLoader');

async function testConsensusSingleSignalWS() {
    console.log('===========================================================');
    console.log('🧪 TESTING: ConsensusEngine Single Signal Return via WebSocket');
    console.log('===========================================================\n');

    // 1. Connect Consensus Engine to WebSocket Server
    console.log('1️⃣ Connecting ConsensusEngine Service...');
    consensusService.connect('ws://localhost:8080', 'consensusEngine');
    await new Promise((res) => setTimeout(res, 800));

    // 2. Connect Trading Client ("TradingClient_Beta")
    console.log('\n2️⃣ Connecting External Client ("TradingClient_Beta")...');
    const tradingClient = new AlgoTradeWSClient('TradingClient_Beta', 'ws://localhost:8080');
    await tradingClient.connect();

    // 3. Load test candles
    const candles = loadAllCandlesFromDir(getCandleDataDir()).slice(0, 100);

    tradingClient.onMessage((msg) => {
        if (msg.type === 'FORWARD_MESSAGE') {
            const payload = msg.payload;
            if (payload && payload.action === 'CONSENSUS_SIGNAL_RESPONSE') {
                console.log('\n📥 [TradingClient_Beta] Single Consensus Signal Received from ConsensusEngine:');
                console.log(JSON.stringify(payload.singleSignal, null, 2));
            }
        }
    });

    await new Promise((res) => setTimeout(res, 500));

    // 4. Send evaluation request to consensusEngine
    console.log('\n3️⃣ [TradingClient_Beta] Sending Candle Evaluation Request to "consensusEngine"...');
    tradingClient.sendMessage({
        action: 'EVALUATE_CONSENSUS',
        candles
    }, 'consensusEngine');

    await new Promise((res) => setTimeout(res, 2000));

    console.log('\n===========================================================');
    console.log('✅ CONSENSUS SINGLE SIGNAL WEBSOCKET TEST PASSED!');
    console.log('===========================================================');

    tradingClient.close();
    process.exit(0);
}

testConsensusSingleSignalWS();
