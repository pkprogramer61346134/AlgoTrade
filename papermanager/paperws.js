const AlgoTradeWSClient = require('../server/wsClient');

/**
 * PAPER ORDER MANAGER WEBSOCKET CONNECTOR
 * 
 * Class responsible for:
 * 1. Managing WebSocket connection for paperOrderManager (serverUrl, clientId).
 * 2. Connecting to the central WebSocket server network.
 * 3. Routing incoming consensus signals and outgoing paper telemetry packets to paperTerminalUI.
 */
class PaperWS {
    /**
     * @param {Object} [options] - Connection options
     * @param {string} [options.serverUrl='ws://localhost:8080'] - Central WS Server URL
     * @param {string} [options.clientId='paperOrderManager'] - Client ID for paper trading
     * @param {string} [options.monitorClientTarget='paperTerminalUI'] - Target recipient ID
     */
    constructor(options = {}) {
        this.serverUrl = options.serverUrl || 'ws://localhost:8080';
        this.clientId = options.clientId || 'paperOrderManager';
        this.monitorClientTarget = options.monitorClientTarget || 'paperTerminalUI';
        this.wsClient = null;
    }

    /**
     * Connects to WebSocket Server and sets up message listener
     * 
     * @param {Function} [onMessageCallback] - Callback handler for incoming messages
     * @returns {Promise<AlgoTradeWSClient>} Connected WebSocket client instance
     */
    async connect(onMessageCallback = null) {
        console.log(`🔌 [PAPER WS] Connecting to ${this.serverUrl} as '${this.clientId}'...`);
        this.wsClient = new AlgoTradeWSClient(this.clientId, this.serverUrl);

        if (typeof onMessageCallback === 'function') {
            this.wsClient.onMessage((msg) => {
                let payload = msg.payload || msg.data || msg;
                if (typeof payload === 'string') {
                    try { payload = JSON.parse(payload); } catch (e) {}
                }
                onMessageCallback(payload);
            });
        }

        await this.wsClient.connect();
        console.log(`✅ [PAPER WS] Connected & Registered Successfully!`);
        return this.wsClient;
    }

    /**
     * Sends message packet to paperTerminalUI and monitorClient recipients
     * 
     * @param {Object} payload - Message content
     * @param {string|string[]} [target=null] - Optional recipient client ID(s)
     */
    sendMessage(payload, target = null) {
        if (this.wsClient && this.wsClient.connected) {
            const targets = target ? (Array.isArray(target) ? target : [target]) : ['paperTerminalUI', 'monitorClient'];
            targets.forEach(t => {
                this.wsClient.sendMessage(payload, t);
            });
        }
    }

    /**
     * Returns whether the WebSocket client is currently connected
     * @returns {boolean}
     */
    isConnected() {
        return Boolean(this.wsClient && this.wsClient.connected);
    }

    /**
     * Closes the WebSocket connection
     */
    close() {
        if (this.wsClient) {
            this.wsClient.close();
            this.wsClient = null;
        }
    }
}

module.exports = PaperWS;
