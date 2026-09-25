/**
 * Dedicated Express Web UI Server for AlgoTrade Backtesting Engine
 * Location: C:\AlgoTrade\server\backtesting\server.js
 * 
 * Runs a standalone Web Server specifically for Backtest execution & visualization.
 * Server Port: 3001 (or process.env.PORT)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const backtestEngine = require('./backtesting');
const backtestConfig = require('./config');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable JSON parsing
app.use(express.json());

// Serve static frontend UI from public directory
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

// Active Backtest Execution Lock
let isBacktestRunning = false;
let currentProgress = null;

/**
 * GET /api/status - Server Status
 */
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        serverTime: new Date().toISOString(),
        isBacktestRunning,
        currentProgress
    });
});

/**
 * GET /api/config - Get Backtest Configuration
 */
app.get('/api/config', (req, res) => {
    res.json({ status: 'success', data: backtestConfig.getConfig() });
});

/**
 * POST /api/config - Save Configuration
 */
app.post('/api/config', (req, res) => {
    const success = backtestConfig.saveConfig(req.body);
    if (success) {
        res.json({ status: 'success', data: backtestConfig.getConfig() });
    } else {
        res.status(500).json({ status: 'error', message: 'Failed to save configuration' });
    }
});

/**
 * GET /api/report - Get Last Backtest Report
 */
app.get('/api/report', (req, res) => {
    const report = backtestEngine.getReport();
    if (report) {
        res.json({ status: 'success', report });
    } else {
        res.status(404).json({ status: 'error', message: 'No backtest report found' });
    }
});

/**
 * POST /api/run - Run Backtest (Synchronous JSON Response)
 */
app.post('/api/run', async (req, res) => {
    if (isBacktestRunning) {
        return res.status(429).json({ status: 'error', message: 'A backtest is already running. Please wait.' });
    }

    try {
        isBacktestRunning = true;
        const params = req.body || {};
        console.log(`\n🚀 [WEB BACKTEST SERVER] Incoming backtest request:`, params);

        const report = await backtestEngine.runBacktest(params);
        isBacktestRunning = false;
        res.json({ status: 'success', report });

    } catch (err) {
        isBacktestRunning = false;
        console.error('❌ [WEB BACKTEST SERVER] Backtest execution error:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/**
 * GET /api/stream - Live Progress Backtest Streaming (Server-Sent Events)
 */
app.get('/api/stream', async (req, res) => {
    if (isBacktestRunning) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Backtest already running' }));
    }

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    isBacktestRunning = true;
    const params = {
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
        interval: req.query.interval,
        initialBalance: Number(req.query.initialBalance || 10000),
        lots: Number(req.query.lots || 1),
        lotSize: Number(req.query.lotSize || 65),
        maxTradesPerDay: Number(req.query.maxTradesPerDay || 3),
        targetMode: req.query.targetMode || "TRAILING",
        maxLossPerTrade: Number(req.query.maxLossPerTrade || 300)
    };

    sendEvent('start', { message: 'Backtest started', params });

    try {
        const { candles, report } = await backtestEngine.streamHistoricalCandles(params, async (progress) => {
            currentProgress = progress;
            sendEvent('progress', progress);
            // Brief yield for SSE flushing
            await new Promise(r => setTimeout(r, 2));
        });

        sendEvent('complete', { report });
    } catch (err) {
        console.error('❌ SSE Stream Error:', err.message);
        sendEvent('error', { message: err.message });
    } finally {
        isBacktestRunning = false;
        currentProgress = null;
        res.end();
    }
});

/**
 * GET /api/cached-dates - List cached historical dates
 */
app.get('/api/cached-dates', (req, res) => {
    try {
        const candleDir = path.join(__dirname, '../../candle_data');
        if (!fs.existsSync(candleDir)) {
            return res.json({ status: 'success', dates: [] });
        }

        const files = fs.readdirSync(candleDir);
        const datesSet = new Set();

        files.forEach(f => {
            // Pattern: candles_13_IDX_I_5m_2026-09-21_to_2026-09-21.json
            const match = f.match(/(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})/);
            if (match) {
                datesSet.add(match[1]);
                datesSet.add(match[2]);
            }
        });

        const sortedDates = Array.from(datesSet).sort();
        res.json({
            status: 'success',
            dates: sortedDates,
            minDate: sortedDates[0] || '2026-09-21',
            maxDate: sortedDates[sortedDates.length - 1] || '2026-09-25'
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log('\n==========================================================================');
    console.log(`⚡ [BACKTEST WEB SERVER] Dedicated UI Server is Running!`);
    console.log(`🌐 Open in browser: http://localhost:${PORT}`);
    console.log('==========================================================================\n');
});
