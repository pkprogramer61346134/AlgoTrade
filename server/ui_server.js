/**
 * AlgoTrade Realtime UI Server & REST API
 * Location: C:\AlgoTrade\server\ui_server.js
 */

const express = require('express');
const path = require('path');
const http = require('http');

const mainConfig = require('./config_manager');
const masterSL = require('./masterSL');
const getBacktestEngine = () => require('./backtesting/backtesting');

function createUIServer(port = 3000, getDataFn = null) {
    let server = null;
    const app = express();
    app.use(express.json());

    const publicPath = path.join(__dirname, '../public');
    app.use(express.static(publicPath));

    // ==========================================
    // REST API ENDPOINTS
    // ==========================================

    // 1. Unified Dashboard Payload
    app.get('/api/dashboard', (req, res) => {
        try {
            const data = (typeof getDataFn === 'function')
                ? getDataFn()
                : {
                    cycle: { date: "--", time: "--", isEvaluating: false },
                    realTradeEnabled: Boolean(mainConfig.getConfig().realTradeEnabled),
                    consensus: {
                        consensus: "NO_SIGNAL",
                        entry: null,
                        sl: null,
                        tr: null,
                        confidence: "0%",
                        strategyName: "--",
                        strategyStates: []
                    },
                    masterSL: masterSL.getStatus()
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

    // 3. Update Central Config (password protected)
    app.post('/api/config', (req, res) => {
        try {
            const { realTradeEnabled, password } = req.body || {};
            if (realTradeEnabled !== undefined) {
                if (password !== "pavan61346134") {
                    return res.status(401).json({ status: "error", message: "Incorrect Password! Access Denied." });
                }
            }
            const updated = mainConfig.updateConfig(req.body);
            res.json({ status: "success", data: updated });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 4. Real Trading Status
    app.get('/api/status/real', (req, res) => {
        try {
            res.json({ status: "success", data: masterSL.getStatus() });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 4b. Clear Active Position
    app.post('/api/clear-position', (req, res) => {
        try {
            masterSL.lastTrade = null;
            res.json({ status: "success", message: "Active position cleared successfully!" });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 5. Run Backtest
    app.post('/api/backtest/run', async (req, res) => {
        try {
            const report = await getBacktestEngine().runBacktest(req.body);
            res.json({ status: "success", data: report });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 6. Last Backtest Report
    app.get('/api/backtest/report', (req, res) => {
        try {
            res.json({ status: "success", data: getBacktestEngine().getReport() });
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // 7. Restart Server (password protected)
    app.post('/api/restart-server', (req, res) => {
        try {
            const { password } = req.body || {};
            if (password !== "pavan61346134") {
                return res.status(401).json({ status: "error", message: "Incorrect Password! Access Denied." });
            }

            res.json({ status: "success", message: "Password verified! Restarting server in 1 second..." });

            setTimeout(() => {
                console.log("\n==========================================================================");
                console.log(`🔄 [SERVER RESTART REQUESTED] Spawning new process...`);
                console.log("==========================================================================\n");

                try { if (server) server.close(); } catch (e) { }

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

                setTimeout(() => process.exit(0), 500);
            }, 1000);
        } catch (e) {
            res.status(500).json({ status: "error", message: e.message });
        }
    });

    // Fallback → index.html
    app.use((req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });

    server = http.createServer(app);
    server.listen(port, () => {
        console.log("\n==========================================================================");
        console.log(`🌐 [UI SERVER READY] Dashboard active at http://localhost:${port}`);
        console.log("==========================================================================\n");
    });

    return server;
}

module.exports = { createUIServer };