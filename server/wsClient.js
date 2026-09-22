const { WebSocket } = require('ws');

/**
 * Reusable WebSocket Client Helper
 * Any component (Trading AI, Order Client, Strategy) can use this to send/receive messages to/from candleDataHub.
 */
class AlgoTradeWSClient {
    constructor(clientId, serverUrl = 'ws://localhost:8080') {
        this.clientId = clientId;
        this.serverUrl = serverUrl;
        this.ws = null;
        this.connected = false;
        this.listeners = [];
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.serverUrl);

            this.ws.on('open', () => {
                this.connected = true;
                console.log(`[WS Client: ${this.clientId}] Connected to ${this.serverUrl}`);
                // Register ID with server
                this.ws.send(JSON.stringify({ type: 'REGISTER', clientId: this.clientId }));
            });

            this.ws.on('message', (rawData) => {
                try {
                    const data = JSON.parse(rawData.toString());

                    // Auto-send delivery ACK when forwarded a message
                    if (data.type === 'FORWARD_MESSAGE') {
                        this.ws.send(JSON.stringify({
                            type: 'CLIENT_DELIVERED_ACK',
                            messageId: data.messageId,
                            originalSenderId: data.senderId
                        }));
                    }

                    if (data.type === 'REGISTERED_SUCCESS') {
                        resolve(this);
                    }

                    // Trigger listeners
                    for (const listener of this.listeners) {
                        listener(data);
                    }
                } catch (e) {
                    console.error(`[WS Client: ${this.clientId}] Error parsing message:`, e.message);
                }
            });

            this.ws.on('error', (err) => {
                console.error(`[WS Client: ${this.clientId}] WebSocket Error:`, err.message);
                reject(err);
            });

            this.ws.on('close', () => {
                this.connected = false;
                console.log(`[WS Client: ${this.clientId}] Connection closed.`);
            });
        });
    }

    /**
     * Send message to candleDataHub or any specific target client
     * @param {object} payload - data payload
     * @param {string} recipientId - target client ID (default: 'candleDataHub')
     */
    sendMessage(payload, recipientId = 'candleDataHub') {
        if (!this.connected || !this.ws) {
            throw new Error(`[WS Client: ${this.clientId}] Cannot send - client is not connected.`);
        }

        const packet = {
            type: 'SEND_MESSAGE',
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            recipientId,
            payload
        };

        this.ws.send(JSON.stringify(packet));
        console.log(`📤 [WS Client: ${this.clientId}] Message sent to "${recipientId}":`, payload);
    }

    /**
     * Listen for incoming messages
     * @param {Function} callback - (data) => {}
     */
    onMessage(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

module.exports = AlgoTradeWSClient;
