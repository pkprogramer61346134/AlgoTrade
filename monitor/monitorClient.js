const path = require('path');
const express = require('express');
const http = require('http');
const AlgoTradeWSClient = require('../server/wsClient');

/**
 * CENTRAL MONITOR CLIENT & WEB UI DASHBOARD SERVER
 * 
 * 1. Express HTTP Web Server running on Port 3000 (0.0.0.0 for external VM access)
 * 2. Connects to WebSocket Server (ws://localhost:8080) as "monitorClient"
 * 3. Serves the Web Dashboard UI at http://localhost:3000
 */
class MonitorClient {
    constructor(options = {}) {
        this.wsServerUrl = options.wsServerUrl || 'ws://localhost:8080';
        this.webPort = options.webPort || 3000;
        this.clientId = options.clientId || 'monitorClient';
        
        this.wsClient = null;
        this.app = express();
        this.server = http.createServer(this.app);

        // Telemetry State Storage
        this.liveOrderManagerState = null;
        this.paperOrderManagerState = null;
        this.backtestState = null;
    }

    async init() {
        console.log('===========================================================');
        console.log('🖥️ [MONITOR CLIENT] Initializing Central Web Monitor & Command Center...');
        console.log('===========================================================');

        // 1. Serve static Web Dashboard files from public directory
        const publicDir = path.join(__dirname, 'public');
        this.app.use(express.static(publicDir));
        this.app.use(express.json());

        // Status API
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'online',
                webPort: this.webPort,
                wsServerUrl: this.wsServerUrl,
                timestamp: new Date()
            });
        });

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.warn(`⚠️ [MONITOR CLIENT] Web Port ${this.webPort} is already in use. Server is running.`);
            } else {
                console.error('❌ [MONITOR CLIENT] Server error:', err.message);
            }
        });

        // Start HTTP Web Server on 0.0.0.0 so VM IP can access it externally
        this.server.listen(this.webPort, '0.0.0.0', () => {
            console.log(`====================================================`);
            console.log(`🌐 AlgoTrade Web Dashboard running at: http://localhost:${this.webPort}`);
            console.log(`🌐 External VM Access: http://0.0.0.0:${this.webPort}`);
            console.log(`====================================================`);
        });

        // 2. Connect to WebSocket Central Server as "monitorClient"
        try {
            this.wsClient = new AlgoTradeWSClient(this.clientId, this.wsServerUrl);
            await this.wsClient.connect();

            this.wsClient.onMessage((msg) => {
                this.handleTelemetryMessage(msg);
            });

            console.log(`✅ [MONITOR CLIENT] Registered on WebSocket Server as "${this.clientId}". Listening for updates...\n`);
        } catch (e) {
            console.warn(`⚠️ [MONITOR CLIENT] Initial WebSocket connect warning: ${e.message}. Will auto-reconnect when WS Server is active.\n`);
        }
    }

    handleTelemetryMessage(msg) {
        if (!msg) return;

        // 1. Live Money Order Manager Telemetry
        if (msg.type === 'LIVE_MONITOR_UPDATE') {
            this.liveOrderManagerState = msg.data;
            this.logConsoleUpdate('🔴 [REAL MONEY]', msg.data);
        }

        // 2. Paper Trading Order Manager Telemetry
        else if (msg.type === 'PAPER_MONITOR_UPDATE') {
            this.paperOrderManagerState = msg.data;
            this.logConsoleUpdate('📝 [PAPER TRADING]', msg.data);
        }

        // 3. Backtest Engine Telemetry
        else if (msg.type === 'BACKTEST_MONITOR_UPDATE') {
            this.backtestState = msg.data;
            this.logConsoleUpdate('🧪 [BACKTEST]', msg.data);
        }
    }

    logConsoleUpdate(tag, payload) {
        if (payload && payload.data && payload.data.summary) {
            console.log(`[MONITOR] ${tag} Event: ${payload.event} | Trades: ${payload.data.summary.totalTrades} | Winrate: ${payload.data.summary.winratePercent} | PnL: ₹${payload.data.summary.realizedPnl}`);
        }
    }
}

// Standalone runner
if (require.main === module) {
    async function startMonitor() {
        const monitor = new MonitorClient();
        await monitor.init();
    }
    startMonitor();
}

module.exports = MonitorClient;
