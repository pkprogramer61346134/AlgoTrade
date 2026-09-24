const { WebSocket } = require('ws');

/**
 * HEAD WEBSOCKET CONNECTOR
 * 
 * Class responsible for:
 * 1. Managing WebSocket connection for Master Consensus Engine.
 * 2. Connecting to central WS server (default ws://localhost:8080).
 * 3. Registering ID and handling reconnects automatically.
 */
class HeadWS {
    /**
     * @param {string} [serverUrl='ws://localhost:8080'] - Central WS Server URL
     * @param {string} [clientId='consensusEngine'] - Client ID for registration
     */
    constructor(serverUrl = 'ws://localhost:8080', clientId = 'consensusEngine') {
        this.serverUrl = serverUrl;
        this.clientId = clientId;
        this.ws = null;
        this.connected = false;
    }

    /**
     * Connects to WebSocket Server and sets up message handler
     * 
     * @param {Function} [onMessageHandler] - Message callback
     * @returns {Promise<WebSocket>}
     */
    connect(serverUrl = this.serverUrl, clientId = this.clientId, onMessageHandler = null) {
        this.serverUrl = serverUrl || this.serverUrl;
        this.clientId = clientId || this.clientId;

        return new Promise((resolve) => {
            try {
                this.ws = new WebSocket(this.serverUrl);

                this.ws.on('open', () => {
                    this.connected = true;
                    console.log(`🧠 [HEAD WS] Connected to ${this.serverUrl} as '${this.clientId}'`);
                    this.sendRaw({ type: 'REGISTER', clientId: this.clientId });
                    resolve(this.ws);
                });

                this.ws.on('message', (rawData) => {
                    try {
                        const message = JSON.parse(rawData.toString());
                        if (typeof onMessageHandler === 'function') {
                            onMessageHandler(message);
                        }
                    } catch (e) {}
                });

                this.ws.on('close', () => {
                    this.connected = false;
                    console.warn(`⚠️ [HEAD WS] Connection closed. Reconnecting in 3s...`);
                    setTimeout(() => this.connect(this.serverUrl, this.clientId, onMessageHandler), 3000);
                });

                this.ws.on('error', (err) => {
                    console.error(`❌ [HEAD WS] Connection Error: ${err.message}`);
                });
            } catch (err) {
                console.error(`❌ [HEAD WS] Fatal error: ${err.message}`);
                resolve(null);
            }
        });
    }

    /**
     * Sends raw JSON message over WebSocket
     * @param {Object} obj 
     */
    sendRaw(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    /**
     * Checks if WebSocket is open and connected
     * @returns {boolean}
     */
    isConnected() {
        return Boolean(this.connected && this.ws && this.ws.readyState === WebSocket.OPEN);
    }
}

module.exports = HeadWS;
