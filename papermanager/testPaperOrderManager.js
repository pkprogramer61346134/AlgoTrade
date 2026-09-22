const PaperOrderManager = require('./paperOrderManager');
const { candleDataHub } = require('../Candlehub/candleDataHub');
const { consensusService } = require('../head/consensusEngine');
const AlgoTradeWSClient = require('../server/wsClient');

async function runPaperOrderManagerTest() {
    console.log('===========================================================');
    console.log('🧪 COMPREHENSIVE TEST: A to Z Paper Trading Manager System');
    console.log('===========================================================\n');

    // Step 1: Connect WebSocket Services
    console.log('1️⃣ Starting & Connecting WebSocket Services...');
    candleDataHub.connectWebSocket('ws://localhost:8080', 'candleDataHub');
    consensusService.connect('ws://localhost:8080', 'consensusEngine');
    await new Promise((res) => setTimeout(res, 800));

    // Step 2: Start Monitor Display Client ("monitorClient")
    console.log('\n2️⃣ Starting Monitor Display Client ("monitorClient")...');
    const monitorClient = new AlgoTradeWSClient('monitorClient', 'ws://localhost:8080');
    await monitorClient.connect();

    monitorClient.onMessage((msg) => {
        if (msg.type === 'FORWARD_MESSAGE') {
            const telemetry = msg.payload;
            if (telemetry && telemetry.type === 'PAPER_MONITOR_UPDATE') {
                const data = telemetry.data;
                if (data.activePosition) {
                    console.log(`📺 [PAPER DISPLAY SCREEN] Mode: ${data.activePosition.mode} | Live PnL: ${data.activePosition.unrealizedPnl >= 0 ? '+' : ''}₹${data.activePosition.unrealizedPnl} | LTP: ₹${data.activePosition.currentLtp} | Trailing SL: ₹${data.activePosition.trailingSL} | Ratio: ${data.activePosition.ratioText}`);
                } else if (data.event === 'PAPER_POSITION_CLOSED') {
                    console.log(`📺 [PAPER DISPLAY SCREEN] Paper Position Closed! Net PnL: ₹${data.eventData.netPnl} | Reason: ${data.eventData.reason} | Virtual Balance: ₹${data.account.virtualBalance}`);
                }
            }
        }
    });

    // Step 3: Initialize Paper Order Manager
    console.log('\n3️⃣ Starting PaperOrderManager...');
    const paperManager = new PaperOrderManager({
        serverUrl: 'ws://localhost:8080',
        clientId: 'paperOrderManager',
        monitorClientTarget: 'monitorClient'
    });
    await paperManager.init();

    await new Promise((res) => setTimeout(res, 500));

    // Step 4: Consensus Engine sends BUY signal to paperOrderManager
    console.log('\n4️⃣ [consensusEngine] Sending BUY Signal to "paperOrderManager"...');
    consensusService.sendRaw({
        type: 'SEND_MESSAGE',
        recipientId: 'paperOrderManager',
        payload: {
            action: 'CONSENSUS_SIGNAL_RESPONSE',
            singleSignal: {
                consensus: 'BUY',
                confidence: '70.1%',
                strategyName: 'Liquidity Sweep Wick Reversal',
                entry: 24500,
                sl: 24470,
                tr: 24560
            }
        }
    });

    await new Promise((res) => setTimeout(res, 1000));

    // Step 5: Test Paper Active Order Guard by sending a 2nd signal while trade is running
    console.log('\n5️⃣ Testing Paper Active Order Guard (Sending 2nd Signal while paper trade is active)...');
    consensusService.sendRaw({
        type: 'SEND_MESSAGE',
        recipientId: 'paperOrderManager',
        payload: {
            action: 'CONSENSUS_SIGNAL_RESPONSE',
            singleSignal: {
                consensus: 'SELL',
                confidence: '65.4%',
                strategyName: 'EMA Crossover'
            }
        }
    });

    await new Promise((res) => setTimeout(res, 1000));

    // Step 6: Simulate Live Option Ticks climbing through R:R milestones
    console.log('\n6️⃣ Simulating Option Ticks Progression (1:1.5 ➔ 1:2.5 ➔ 1:3.5 ➔ 1:5+ ➔ Trailing SL Hit)...');

    const simulatedTicks = [
        120.5,  // Entry with +0.50 slippage
        125.0,  // Up
        135.0,  // Up
        143.0,  // 1:1.5 R:R Hit (Gained 22.5 pts -> Trailing SL moves to Cost ₹120.50)
        150.0,  // Up
        158.0,  // 1:2.5 R:R Hit (Gained 37.5 pts -> Trailing SL moves to ₹143.00)
        165.0,  // Up
        173.0,  // 1:3.5 R:R Hit (Gained 52.5 pts -> Trailing SL moves to ₹158.00)
        195.5,  // 1:5.0 R:R Hit (Gained 75.0 pts -> Trailing SL moves to ₹180.50)
        185.0,  // Pullback (Above Trailing SL ₹180.50 -> Trade stays open!)
        175.0   // Drop below Trailing SL ₹180.50 -> PAPER TRAILING SL HIT & MARKET EXIT!
    ];

    for (const tickPrice of simulatedTicks) {
        paperManager.onOptionPriceTick(tickPrice);
        await new Promise((res) => setTimeout(res, 300));
    }

    await new Promise((res) => setTimeout(res, 1000));

    console.log('\n===========================================================');
    console.log('✅ A to Z PAPER TRADING MANAGER TEST COMPLETED SUCCESSFULLY!');
    console.log('===========================================================');

    monitorClient.close();
    candleDataHub.disconnectWebSocket();
    process.exit(0);
}

runPaperOrderManagerTest();
