const { WebSocketServer, WebSocket } = require('ws');

/**
 * WebSocket Messaging Server
 * - Client Registration by `clientId`
 * - Message forwarding (Client A -> Server -> Client B)
 * - Auto-reply routing (remembers last sender for each client)
 * - Delivery ACKs (SERVER_ACK & DELIVERY_CONFIRMED to sender)
 */
class MessagingWSServer {
    constructor(serverOptions) {
        this.wss = new WebSocketServer(serverOptions);
        
        // Map of clientId -> { ws, connectedAt }
        this.clients = new Map();
        
        // Map of client ws -> clientId (for fast reverse lookup on disconnect)
        this.wsToClientId = new Map();
        
        // Track last sender for each recipient to enable auto-reply when recipientId is omitted
        // Map<recipientId, lastSenderId>
        this.lastSenderMap = new Map();

        this.init();
    }

    init() {
        this.wss.on('connection', (ws, req) => {
            console.log(`[WS Server] New connection from ${req.socket.remoteAddress}`);

            ws.on('message', (rawMessage) => {
                try {
                    const message = JSON.parse(rawMessage.toString());
                    this.handleClientMessage(ws, message);
                } catch (err) {
                    console.error('[WS Server] Failed to parse message JSON:', err.message);
                    this.sendToWs(ws, {
                        type: 'ERROR',
                        error: 'Invalid JSON format'
                    });
                }
            });

            ws.on('close', () => {
                const clientId = this.wsToClientId.get(ws);
                if (clientId) {
                    console.log(`[WS Server] Client disconnected: ${clientId}`);
                    this.clients.delete(clientId);
                    this.wsToClientId.delete(ws);
                    this.broadcastSystemEvent('CLIENT_DISCONNECTED', { clientId });
                }
            });

            ws.on('error', (err) => {
                console.error('[WS Server] Socket error:', err.message);
            });
        });

        console.log('[WS Server] WebSocket Messaging Server initialized.');
    }

    handleClientMessage(ws, message) {
        const { type } = message;

        switch (type) {
            case 'REGISTER':
                this.handleRegister(ws, message);
                break;
            case 'SEND_MESSAGE':
            case 'FORWARD_MESSAGE':
                this.handleSendMessage(ws, message);
                break;
            case 'CLIENT_DELIVERED_ACK':
                this.handleClientDeliveredAck(ws, message);
                break;
            case 'GET_CLIENTS':
                this.sendToWs(ws, {
                    type: 'CLIENT_LIST',
                    clients: Array.from(this.clients.keys())
                });
                break;
            default:
                console.warn(`[WS Server] Unknown message type: ${type}`);
                this.sendToWs(ws, { type: 'ERROR', error: `Unknown message type: ${type}` });
        }
    }

    handleRegister(ws, { clientId }) {
        if (!clientId || typeof clientId !== 'string') {
            return this.sendToWs(ws, { type: 'ERROR', error: 'clientId is required for registration' });
        }

        // Clean up previous registration if re-registering on same socket
        const oldClientId = this.wsToClientId.get(ws);
        if (oldClientId && oldClientId !== clientId) {
            this.clients.delete(oldClientId);
        }

        this.clients.set(clientId, { ws, connectedAt: new Date() });
        this.wsToClientId.set(ws, clientId);

        console.log(`[WS Server] Registered client: "${clientId}"`);

        this.sendToWs(ws, {
            type: 'REGISTERED_SUCCESS',
            clientId,
            timestamp: Date.now()
        });

        // Notify connected clients
        this.broadcastSystemEvent('CLIENT_CONNECTED', { clientId });
    }

    handleSendMessage(ws, message) {
        const senderId = this.wsToClientId.get(ws);
        if (!senderId) {
            return this.sendToWs(ws, {
                type: 'ERROR',
                error: 'Unauthorized. You must send a REGISTER message first.'
            });
        }

        const { messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, payload } = message;
        let recipientId = message.recipientId;

        // Auto-reply fallback: if recipientId is not passed, use the lastSender who messaged this sender
        if (!recipientId) {
            recipientId = this.lastSenderMap.get(senderId);
            if (recipientId) {
                console.log(`[WS Server] Auto-routing message from "${senderId}" to last sender "${recipientId}"`);
            }
        }

        if (!recipientId) {
            return this.sendToWs(ws, {
                type: 'UNDELIVERED_ERROR',
                messageId,
                error: 'No recipientId provided and no prior interaction to auto-reply to.'
            });
        }

        // Step 1: Send SERVER_ACK immediately back to sender
        this.sendToWs(ws, {
            type: 'SERVER_ACK',
            messageId,
            recipientId,
            timestamp: Date.now()
        });

        const targetClient = this.clients.get(recipientId);

        // Check if recipient is connected
        if (!targetClient || targetClient.ws.readyState !== WebSocket.OPEN) {
            console.warn(`[WS Server] Recipient "${recipientId}" is offline.`);
            return this.sendToWs(ws, {
                type: 'UNDELIVERED_OFFLINE',
                messageId,
                recipientId,
                timestamp: Date.now(),
                reason: `Client "${recipientId}" is not connected to server.`
            });
        }

        // Store senderId as the lastSender for recipientId (enables recipient to auto-reply)
        this.lastSenderMap.set(recipientId, senderId);

        // Step 2: Forward message to Recipient Client
        const forwardPacket = {
            type: 'FORWARD_MESSAGE',
            messageId,
            senderId,
            recipientId,
            payload,
            timestamp: Date.now()
        };

        targetClient.ws.send(JSON.stringify(forwardPacket));
        console.log(`[WS Server] Message "${messageId}" forwarded from "${senderId}" -> "${recipientId}"`);
    }

    handleClientDeliveredAck(ws, { messageId, originalSenderId }) {
        const recipientId = this.wsToClientId.get(ws);
        console.log(`[WS Server] Delivery ACK received from "${recipientId}" for msg "${messageId}" (original sender: "${originalSenderId}")`);

        // Step 3: Notify original sender that message was delivered to recipient
        const senderClient = this.clients.get(originalSenderId);
        if (senderClient && senderClient.ws.readyState === WebSocket.OPEN) {
            this.sendToWs(senderClient.ws, {
                type: 'DELIVERY_CONFIRMED',
                messageId,
                deliveredTo: recipientId,
                timestamp: Date.now()
            });
        }
    }

    sendToWs(ws, obj) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(obj));
        }
    }

    broadcastSystemEvent(event, data) {
        const eventPacket = JSON.stringify({ type: 'SYSTEM_EVENT', event, data, timestamp: Date.now() });
        for (const { ws } of this.clients.values()) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(eventPacket);
            }
        }
    }
}

module.exports = MessagingWSServer;
