/**
 * AlgoTrade Realtime UI Server & REST API
 * Location: C:\AlgoTrade\server\ui_server.js
 */

const express = require('express');
const path = require('path');
const http = require('http');

const mainConfig = require('./config_manager');
const masterSL = require('./masterSL/masterSL');
const realTradeEngine = require('./realtread/realtread');
const realConfig = require('./realtread/config');
const backtestEngine = require('./backtesting/backtesting');

function createUIServer(port = 3000) {
    let server = null;
    const app = express();
    app.use(express.json());

    // Serve static frontend dashboard files
    const publicPath = path.join(__dirname, '../public');
    app.use(express.static(publicPath));

    // Lazy load main.js reference for getLiveMarketData
    let mainModule = null;
    try {
        mainModule = require('../main');
    } catch (e) {}

    // ==========================================
    // REST API ENDPOINTS
    // ==========================================

    // 1. Unified Dashboard Payload Endpoint
    app.get('/api/dashboard', (req, res) => {
        try {
            if (!mainModule) {
                try { mainModule = require('../main'); } catch (e) {}
            }
            const data = mainModule && mainModule.getLiveMarketData ? mainModule.getLiveMarketData() : {
                livePrice: 0,
                consensus: { consensus: "NO_SIGNAL", strategyStates: [] },
                config: mainConfig.getConfig(),
                realStatus: realTradeEngine.getStatus()
            };
            res.json({ status: "success", data });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 2. Get Central Config
    app.get('/api/config', (req, res) => {
        try {
            res.json({ status: "success", data: mainConfig.getConfig() });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 3. Update Central Config (Real Trading Toggle - Password Protected: pavan61346134)
    app.post('/api/config', (req, res) => {
        try {
            const { realTradeEnabled, password } = req.body || {};

            // Password verification for toggles
            if (realTradeEnabled !== undefined) {
                if (password !== "pavan61346134") {
                    return res.status(401).json({ status: "error", message: "Incorrect Password! Access Denied." });
                }
            }

            const updated = mainConfig.updateConfig(req.body);
            
            // Sync engine
            if (realTradeEnabled !== undefined) {
                if (realTradeEnabled) realTradeEngine.startRealTrading();
                else realTradeEngine.stopRealTrading();
            }

            res.json({ status: "success", data: updated });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 4. Get Real Trading Status
    app.get('/api/status/real', (req, res) => {
        try {
            const status = realTradeEngine.getStatus();
            res.json({ status: "success", data: status });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 4b. Clear / Reset Active Position Endpoint
    app.post('/api/clear-position', (req, res) => {
        try {
            masterSL.activePosition = null;
            res.json({ status: "success", message: "Active position cleared successfully!" });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 5. Run Backtest Engine
    app.post('/api/backtest/run', async (req, res) => {
        try {
            const report = await backtestEngine.runBacktest(req.body);
            res.json({ status: "success", data: report });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 6. Get Last Backtest Report
    app.get('/api/backtest/report', (req, res) => {
        try {
            const report = backtestEngine.getReport();
            res.json({ status: "success", data: report });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 7. Restart Server Endpoint (Password Protected: pavan61346134)
    app.post('/api/restart-server', (req, res) => {
        try {
            const { password } = req.body || {};
            if (password !== "pavan61346134") {
                return res.status(401).json({ status: "error", message: "Incorrect Password! Access Denied." });
            }

            res.json({ status: "success", message: "Password verified! Restarting server in 1 second..." });

            setTimeout(() => {
                console.log("\n==========================================================================");
                console.log(`🔄 [SERVER RESTART REQUESTED] Password Verified! Spawning new server process...`);
                console.log("==========================================================================\n");

                try {
                    if (server) {
                        server.close();
                    }
                } catch (e) {}

                try {
                    const { spawn } = require('child_process');
                    const scriptPath = process.argv[1] || path.join(__dirname, '../main.js');
                    const child = spawn(process.execPath, [scriptPath], {
                        cwd: process.cwd(),
                        detached: true,
                        stdio: 'ignore'
                    });
                    child.unref();
                } catch (err) {
                    console.error("❌ Error spawning restart process:", err.message);
                }

                setTimeout(() => {
                    process.exit(0);
                }, 500);
            }, 1000);
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // Fallback middleware to serve index.html for unknown routes
    app.use((req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });

    server = http.createServer(app);
    server.listen(port, () => {
        console.log("\n==========================================================================");
        console.log(`🌐 [UI SERVER READY] Realtime Chrome Dashboard active!`);
        console.log(`👉 Open in Chrome : http://localhost:${port}`);
        console.log("==========================================================================\n");
    });

    return server;
}

module.exports = { createUIServer };
