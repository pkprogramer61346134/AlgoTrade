/**
 * Shared WebSocket Client & Telemetry Helper for Web Dashboard Pages
 */
const wsUrl = `ws://${window.location.hostname}:8080`;
let socket = null;

function initWebMonitorSocket(onMessageCallback) {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        if (dot) dot.classList.remove('offline');
        if (text) text.innerText = 'WS Server Connected (Port 8080)';

        // Register web monitor
        socket.send(JSON.stringify({
            type: 'REGISTER',
            clientId: 'monitorClient'
        }));
    };

    socket.onmessage = (event) => {
        try {
            const rawMsg = JSON.parse(event.data);
            // Automatically unwrap FORWARD_MESSAGE packets sent from sub-clients over WebSocket
            let unwrapped = rawMsg;
            if (rawMsg.type === 'FORWARD_MESSAGE' && rawMsg.payload) {
                unwrapped = rawMsg.payload;
            }
            if (onMessageCallback) onMessageCallback(unwrapped, rawMsg);
        } catch (e) {}
    };

    socket.onclose = () => {
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        if (dot) dot.classList.add('offline');
        if (text) text.innerText = 'Disconnected. Reconnecting...';
        setTimeout(() => initWebMonitorSocket(onMessageCallback), 2000);
    };
}

function setRoutingMode(mode) {
    const modeElem = document.getElementById('currentRoutingMode');
    if (modeElem) {
        modeElem.innerText = mode === 'PAPER' ? 'PAPER TRADING' : (mode === 'REAL' ? 'REAL DHAN MONEY' : 'BOTH (PAPER + REAL)');
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'FORWARD_MESSAGE',
            recipientId: 'consensusEngine',
            payload: {
                action: 'SET_ROUTING_MODE',
                mode: mode
            }
        }));
    }
}

/**
 * Universal Currency & Number Formatter (Indian Rupee Format)
 * Ensures NO double plus (++₹) or ugly raw float overlaps
 */
function formatRupee(val) {
    if (val === undefined || val === null || isNaN(val)) return '₹0.00';
    const num = Number(val);
    const sign = num > 0 ? '+' : (num < 0 ? '-' : '');
    const absStr = Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${sign}₹${absStr}`;
}

/**
 * Human-Readable Exit Reason Cleaner
 */
function cleanExitReason(reason) {
    if (!reason) return 'Manual Exit';
    if (reason.includes('AUTO_CUT') || reason.includes('315')) return '⏰ 3:15 PM EOD Cut';
    if (reason.includes('TARGET') || reason.includes('TP')) return '🎯 Target Profit Hit';
    if (reason.includes('TRAILING_SL') || reason.includes('SL_HIT')) return '🛑 Trailing SL Hit';
    return reason;
}
