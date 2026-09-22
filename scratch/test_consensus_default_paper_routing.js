const { candleDataHub } = require('../Candlehub/candleDataHub');
const { consensusService } = require('../head/consensusEngine');
const PaperOrderManager = require('../papermanager/paperOrderManager');
const SmartOrderManager = require('../ordermanager/smartOrderManager');
const AlgoTradeWSClient = require('../server/wsClient');
const { loadAllCandlesFromDir, getCandleDataDir } = require('../indicators/utils/dataLoader');

async function testDefaultPaperRouting() {
    console.log('===========================================================');
    console.log('🧪 TESTING: ConsensusEngine Default Signal Routing -> paperOrderManager');
    console.log('===========================================================\n');

    // 1. Connect WebSocket Services
    console.log('1️⃣ Connecting WebSocket Services...');
    candleDataHub.connectWebSocket('ws://localhost:8080', 'candleDataHub');
    consensusService.connect('ws://localhost:8080', 'consensusEngine');
    await new Promise((res) => setTimeout(res, 800));

    // 2. Start Paper Trading Manager (DEFAULT RECIPIENT)
    console.log('\n2️⃣ Starting PaperOrderManager...');
    const paperManager = new PaperOrderManager({ serverUrl: 'ws://localhost:8080' });
    await paperManager.init();

    // 3. Start Real Order Manager
    console.log('\n3️⃣ Starting SmartOrderManager...');
    const realManager = new SmartOrderManager({ serverUrl: 'ws://localhost:8080' });
    await realManager.init();

    // 4. Start Monitor Client Listener
    console.log('\n4️⃣ Starting monitorClient...');
    const monitorClient = new AlgoTradeWSClient('monitorClient', 'ws://localhost:8080');
    await monitorClient.connect();

    monitorClient.onMessage((msg) => {
        if (msg.type === 'FORWARD_MESSAGE') {
            const telemetry = msg.payload;
            if (telemetry && telemetry.type === 'PAPER_MONITOR_UPDATE') {
                console.log(`\n✅ [TEST CONFIRMED] Received PAPER_MONITOR_UPDATE telemetry from paperOrderManager! Event: ${telemetry.data.event}`);
            } else if (telemetry && telemetry.type === 'LIVE_MONITOR_UPDATE') {
                console.log(`\n⚡ [TEST REAL TELEMETRY] Received LIVE_MONITOR_UPDATE from orderManager! Event: ${telemetry.data.event}`);
            }
        }
    });

    await new Promise((res) => setTimeout(res, 500));

    // Load candles that trigger a signal
    const candles = loadAllCandlesFromDir(getCandleDataDir());

    // 5. Send evaluation request to consensusEngine WITHOUT mode (Testing DEFAULT routing)
    console.log('\n5️⃣ Client sending Signal Request WITHOUT mode flag (Testing DEFAULT Routing)...');
    const senderClient = new AlgoTradeWSClient('SignalSender', 'ws://localhost:8080');
    await senderClient.connect();

    senderClient.sendMessage({
        action: 'EVALUATE_CONSENSUS',
        candles
    }, 'consensusEngine');

    await new Promise((res) => setTimeout(res, 2500));

    console.log('\n===========================================================');
    console.log('✅ DEFAULT PAPER TRADING ROUTING TEST COMPLETED SUCCESSFULLY!');
    console.log('===========================================================');

    senderClient.close();
    monitorClient.close();
    candleDataHub.disconnectWebSocket();
    process.exit(0);
}

testDefaultPaperRouting();
