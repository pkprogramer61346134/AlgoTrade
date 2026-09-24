const express = require('express');
const path = require('path');
const http = require('http');

const app = express();

// Parse --port argument from CLI (e.g. node paperServer.js --port=3001)
let cliPort = null;
process.argv.forEach(arg => {
    if (arg.startsWith('--port=')) {
        cliPort = parseInt(arg.split('=')[1], 10);
    }
});

const PORT = cliPort || process.env.PAPER_PORT || 3001;

// Serve static assets from papermanager/public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ONLINE', service: 'Paper Trading Terminal Web UI', port: PORT });
});

const server = http.createServer(app);

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ [PAPER SERVER ERROR] Port ${PORT} is already in use by another process. Free port ${PORT} or specify --port=<new_port>`);
    } else {
        console.error(`❌ [PAPER SERVER ERROR] ${err.message}`);
    }
});

server.listen(PORT, () => {
    console.log('=================================================================================');
    console.log(`📝 [DEDICATED PAPER TRADING WEB TERMINAL RUNNING]`);
    console.log(`🌐 Local UI Dashboard : http://localhost:${PORT}`);
    console.log(`🌐 Network UI Dashboard: http://0.0.0.0:${PORT}`);
    console.log('=================================================================================');
});

module.exports = server;
