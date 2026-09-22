const { WebSocket } = require('ws');

const SERVER_URL = 'ws://localhost:8080';

function createClient(clientId) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(SERVER_URL);

        ws.on('open', () => {
            console.log(`[${clientId}] Connected to WebSocket server.`);
            // Register clientId
            ws.send(JSON.stringify({ type: 'REGISTER', clientId }));
        });

        ws.on('message', (raw) => {
            const data = JSON.parse(raw.toString());
            console.log(`📩 [${clientId}] Received:`, JSON.stringify(data));

            // Auto send DELIVERY_ACK when receiving a FORWARD_MESSAGE
            if (data.type === 'FORWARD_MESSAGE') {
                console.log(`✅ [${clientId}] Sending CLIENT_DELIVERED_ACK for msgId: "${data.messageId}" back to server...`);
                ws.send(JSON.stringify({
                    type: 'CLIENT_DELIVERED_ACK',
                    messageId: data.messageId,
                    originalSenderId: data.senderId
                }));
            }

            if (data.type === 'REGISTERED_SUCCESS') {
                resolve({ ws, clientId });
            }
        });

        ws.on('error', (err) => {
            console.error(`[${clientId}] Error:`, err.message);
            reject(err);
        });
    });
}

async function runDemo() {
    console.log('--- STARTING DEMO: CLIENT A <-> SERVER <-> CLIENT B ---');

    try {
        // Step 1: Connect & Register Client A and Client B
        const clientA = await createClient('ClientA');
        const clientB = await createClient('ClientB');

        await new Promise((res) => setTimeout(res, 500));

        // Step 2: Client A sends message to Client B explicitly with recipientId
        console.log('\n--- STEP 1: Client A sends targeted message to Client B ---');
        const msg1 = {
            type: 'SEND_MESSAGE',
            messageId: 'msg_001',
            recipientId: 'ClientB',
            payload: { action: 'PLACE_BUY_ORDER', symbol: 'NIFTY50', qty: 50, price: 24500 }
        };
        console.log('📤 [ClientA] Sending:', JSON.stringify(msg1));
        clientA.ws.send(JSON.stringify(msg1));

        await new Promise((res) => setTimeout(res, 1000));

        // Step 3: Client B replies to Client A WITHOUT passing recipientId (Auto-Reply Routing)
        console.log('\n--- STEP 2: Client B replies WITHOUT recipientId (Auto-Reply Routing) ---');
        const msg2 = {
            type: 'SEND_MESSAGE',
            messageId: 'msg_002',
            // recipientId omitted intentionally! Server auto-routes to ClientA
            payload: { action: 'ORDER_EXECUTED_SUCCESS', orderId: 'ORD_98765', status: 'FILLED' }
        };
        console.log('📤 [ClientB] Replying (recipientId omitted):', JSON.stringify(msg2));
        clientB.ws.send(JSON.stringify(msg2));

        await new Promise((res) => setTimeout(res, 1500));

        console.log('\n--- DEMO COMPLETED SUCCESSFULLY! Closing sockets... ---');
        clientA.ws.close();
        clientB.ws.close();
        process.exit(0);

    } catch (err) {
        console.error('Demo failed:', err);
        process.exit(1);
    }
}

runDemo();
