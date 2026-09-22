const http = require('http');
const express = require('express');
const path = require('path');
const MessagingWSServer = require('./wsServer');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;

// Serve public static files if available
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        activeClients: Array.from(messagingWsServer.clients.keys()),
        timestamp: new Date()
    });
});

// Initialize WebSocket Messaging Server attached to HTTP server
const messagingWsServer = new MessagingWSServer({ server });

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ [WS Server] Port ${PORT} is already in use. Server is already running on this port.`);
    } else {
        console.error('❌ [WS Server] Server error:', err.message);
    }
});

server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 AlgoTrade Messaging Server running on port ${PORT}`);
    console.log(`📡 WebSocket Endpoint: ws://localhost:${PORT}`);
    console.log(`====================================================`);
});

module.exports = { app, server, messagingWsServer };
