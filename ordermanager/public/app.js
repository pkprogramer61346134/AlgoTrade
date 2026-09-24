// Dedicated Real Money Trading Terminal Frontend JS Engine
let ws = null;
let currentRealState = null;
let tradeHistoryList = [];
let lastTickLogTime = 0;

function connectWebSocket() {
    const wsUrl = `ws://${window.location.hostname || 'localhost'}:8080`;
    console.log(`🔌 Connecting to AlgoTrade WebSocket Network at ${wsUrl}...`);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✅ WebSocket Connected!');
        updateConnectionBadge(true);
        // Register client ID with WebSocket server
        ws.send(JSON.stringify({ type: 'REGISTER', clientId: 'realTerminalUI' }));
        // Request immediate Real Dhan Balance & State sync from orderManager
        ws.send(JSON.stringify({
            type: 'SEND_MESSAGE',
            recipientId: 'orderManager',
            payload: { action: 'GET_REAL_STATE' }
        }));
        addLogLine('✅ Connected to Central WebSocket Server (ws://localhost:8080)');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleIncomingPacket(data);
        } catch (e) {
            console.error('Error parsing WS message:', e);
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
        updateConnectionBadge(false);
    };

    ws.onclose = () => {
        console.warn('WebSocket Closed. Reconnecting in 3s...');
        updateConnectionBadge(false);
        addLogLine('⚠️ Connection Closed. Retrying in 3 seconds...');
        setTimeout(connectWebSocket, 3000);
    };
}

function updateConnectionBadge(isConnected) {
    const badge = document.getElementById('connectionBadge');
    const text = document.getElementById('connText');
    if (isConnected) {
        badge.className = 'status-pill online';
        text.innerText = 'WS CONNECTED';
    } else {
        badge.className = 'status-pill offline';
        text.innerText = 'DISCONNECTED';
    }
}

function handleIncomingPacket(packet) {
    if (!packet) return;

    let payload = packet.payload || packet.data || packet;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (e) {}
    }

    // Direct Master Head Signal forwarding
    if (payload.action === 'CONSENSUS_SIGNAL_RESPONSE' || payload.singleSignal || payload.action === 'HEAD_SIGNAL_TELEMETRY') {
        const sig = payload.singleSignal || payload.signal || payload;
        if (sig && sig.consensus) {
            addLogLine(`🧠 [MASTER HEAD SIGNAL] Received Signal: ${sig.consensus} (Spot ₹${sig.entry || '23200'} | Strat: ${sig.strategyName || 'Master Head'})`);
        }
    }

    // Listen for LIVE_MONITOR_UPDATE telemetry from SmartOrderManager
    if (packet.type === 'LIVE_MONITOR_UPDATE' || payload.type === 'LIVE_MONITOR_UPDATE' || payload.event || payload.balance !== undefined) {
        const telemetry = payload.data || payload;
        updateRealDashboard(telemetry);
    }

    if (packet.type === 'FORWARD_MESSAGE' && payload) {
        if (payload.type === 'LIVE_MONITOR_UPDATE' && payload.data) {
            updateRealDashboard(payload.data);
        } else if (payload.data && (payload.data.event || payload.data.balance !== undefined)) {
            updateRealDashboard(payload.data);
        } else if (payload.event || payload.balance !== undefined) {
            updateRealDashboard(payload);
        }
    }
}

function updateRealDashboard(data) {
    if (!data) return;

    // Account & Balance Stats
    const realBalance = Number(data.balance || data.account?.availableFunds || 0.0);
    const marginUsed = Number(data.account?.marginUsed || 0.0);
    const summary = data.todaySummary || data.summary || {};

    document.getElementById('kpiRealBalance').innerText = formatRupee(realBalance);
    document.getElementById('kpiRealizedPnl').innerText = formatRupee(summary.realizedPnl || 0.0);
    document.getElementById('kpiRealizedPnl').className = `kpi-value ${(summary.realizedPnl || 0) >= 0 ? 'val-green' : 'val-red'}`;
    document.getElementById('kpiTradeStats').innerText = `${summary.totalTrades || 0} Trades / ${summary.winratePercent || '0.0%'} Winrate`;
    document.getElementById('kpiMarginUsed').innerText = formatRupee(marginUsed);
    document.getElementById('kpiAvailableMargin').innerText = `Available: ${formatRupee(realBalance - marginUsed)}`;

    // Active Position Stats
    const pos = data.activePosition;
    const btnExit = document.getElementById('btnClosePosition');

    if (pos && pos.status === 'OPEN') {
        document.getElementById('posStatusBadge').className = 'badge-status active';
        document.getElementById('posStatusBadge').innerText = '🔴 LIVE DHAN POSITION';
        document.getElementById('posSymbol').innerText = pos.symbol;
        document.getElementById('posMetaDetails').innerText = `Option Type: ${pos.optionType || 'CE/PE'} | Security ID: ${pos.securityId || '--'}`;

        document.getElementById('posEntryPrice').innerText = `₹${pos.entryPrice}`;
        document.getElementById('posCurrentLtp').innerText = `₹${pos.currentLtp}`;
        document.getElementById('posTargetTp').innerText = `₹${pos.targetProfit}`;
        document.getElementById('posInitialSl').innerText = `₹${pos.initialSL}`;
        document.getElementById('posTrailingSl').innerText = `₹${pos.trailingSL || pos.currentTrailingSL || pos.initialSL}`;
        document.getElementById('posMilestoneStep').innerText = pos.ratioText || pos.currentRatioText || '1:0';
        document.getElementById('posPeakHigh').innerText = `₹${pos.highestPriceSeen || pos.currentLtp}`;

        const unrealizedPnl = Number(pos.unrealizedPnl || 0.0);
        document.getElementById('kpiUnrealizedPnl').innerText = formatRupee(unrealizedPnl);
        document.getElementById('kpiUnrealizedPnl').className = `kpi-value ${unrealizedPnl >= 0 ? 'val-green' : 'val-red'}`;
        document.getElementById('kpiPnlPercentage').innerText = `${pos.pnlPercentage ? (pos.pnlPercentage >= 0 ? '+' : '') + pos.pnlPercentage + '%' : '0.00% Return'}`;

        btnExit.disabled = false;
    } else {
        document.getElementById('posStatusBadge').className = 'badge-status idle';
        document.getElementById('posStatusBadge').innerText = 'IDLE / NO REAL POSITION';
        document.getElementById('posSymbol').innerText = 'None (Waiting for Consensus Signal)';
        document.getElementById('posMetaDetails').innerText = '-- | Option Type: -- | Security ID: --';

        document.getElementById('posEntryPrice').innerText = '₹0.00';
        document.getElementById('posCurrentLtp').innerText = '₹0.00';
        document.getElementById('posTargetTp').innerText = '₹0.00';
        document.getElementById('posInitialSl').innerText = '₹0.00';
        document.getElementById('posTrailingSl').innerText = '₹0.00';
        document.getElementById('posMilestoneStep').innerText = '1:0';
        document.getElementById('posPeakHigh').innerText = '₹0.00';

        document.getElementById('kpiUnrealizedPnl').innerText = '+₹0.00';
        document.getElementById('kpiUnrealizedPnl').className = 'kpi-value val-green';
        document.getElementById('kpiPnlPercentage').innerText = '0.00% Return';

        btnExit.disabled = true;
    }

    // Real-Time Master Head Signal & Event Logging into System Activity Console
    if (data.event === 'SIGNAL_RECEIVED') {
        const sig = data.eventData?.signal || {};
        addLogLine(`📩 [CONSENSUS SIGNAL] Head sent Signal: ${sig.consensus || 'NONE'} (Spot ₹${sig.entry || 'N/A'} | Strategy: ${sig.strategyName || 'Master Head'})`);
    } else if (data.event === 'SIGNAL_IGNORED_NO_ACTION') {
        const sig = data.eventData?.signal || {};
        addLogLine(`ℹ️ [SIGNAL EVALUATED] Signal is ${sig.consensus || 'NO_SIGNAL'}. No trade execution required.`);
    } else if (data.event === 'SIGNAL_IGNORED_ACTIVE_POSITION') {
        const sig = data.eventData?.signal || {};
        addLogLine(`⚠️ [HEAD SIGNAL IGNORED] Signal ${sig.consensus || 'Trade'} (Spot ₹${sig.entry || '23200'}) ignored because Real Position (${data.activePosition?.symbol || 'Trade'}) is already OPEN.`);
    } else if (data.event === 'ORDER_FAILED_STRIKE_SELECTION') {
        addLogLine(`❌ [STRIKE RESOLUTION ERROR] ${data.eventData?.error || 'Failed to select strike'}`);
    } else if (data.event === 'ORDER_FAILED_INSUFFICIENT_MARGIN') {
        const req = formatRupee(data.eventData?.requiredMargin);
        const avail = formatRupee(data.eventData?.availableBalance);
        addLogLine(`❌ [INSUFFICIENT FUNDS] Required Margin: ${req} | Available Balance: ${avail}`);
    } else if (data.event === 'ORDER_FAILED_PLACEMENT') {
        addLogLine(`❌ [REAL ORDER EXECUTION ERROR] ${data.eventData?.error || 'Order placement failed'}`);
    } else if (data.event === 'ERROR_ZERO_BALANCE' || data.event === 'ERROR_BALANCE_FETCH_FAILED') {
        addLogLine(`❌ [REAL BALANCE ERROR] ${data.eventData?.error || 'Dhan account balance issue'}`);
    } else if (data.event === 'ORDER_PLACED') {
        addLogLine(`🚀 [REAL ORDER EXECUTED] ${data.activePosition?.symbol} Real Dhan BUY @ ₹${data.activePosition?.entryPrice} (TP: ₹${data.activePosition?.targetProfit} | SL: ₹${data.activePosition?.initialSL})`);
    } else if (data.event === 'POSITION_CLOSED' && data.eventData) {
        addClosedTradeRecord(data.eventData);
    } else if (data.event === 'LIVE_TICK_UPDATE' && data.activePosition) {
        const now = Date.now();
        if (now - lastTickLogTime >= 3000) {
            lastTickLogTime = now;
            addLogLine(`📈 [REAL TICK] ${data.activePosition.symbol} LTP: ₹${data.activePosition.currentLtp} | UnPnL: ${formatRupee(data.activePosition.unrealizedPnl)} | Trailing SL: ₹${data.activePosition.trailingSL}`);
        }
    }
}

function addClosedTradeRecord(trade) {
    if (!trade || !trade.symbol) return;

    tradeHistoryList.unshift(trade);
    renderHistoryTable();
    addLogLine(`🏁 [REAL TRADE CLOSED] ${trade.symbol} | Net PnL: ${formatRupee(trade.netPnl)} | Reason: ${trade.reason}`);
}

function renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    document.getElementById('historyCount').innerText = `${tradeHistoryList.length} Closed Trades`;

    if (tradeHistoryList.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No closed real trades recorded today.</td></tr>`;
        return;
    }

    let html = '';
    tradeHistoryList.forEach((t, i) => {
        const isWin = (t.netPnl || 0) >= 0;
        html += `
            <tr>
                <td>${tradeHistoryList.length - i}</td>
                <td>${t.closedAt || new Date().toLocaleTimeString()}</td>
                <td><strong>${t.symbol}</strong></td>
                <td><span class="badge-status ${t.optionType === 'CE' ? 'active' : 'idle'}">${t.optionType || 'REAL'}</span></td>
                <td>₹${t.entryPrice}</td>
                <td>₹${t.exitPrice}</td>
                <td>${t.qty || 65}</td>
                <td class="${isWin ? 'val-green' : 'val-red'}"><strong>${formatRupee(t.netPnl)}</strong></td>
                <td><span class="stat-label">${t.reason || 'MANUAL'}</span></td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function triggerTestSignal(consensusType) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('WebSocket is not connected to server!');
        return;
    }

    const testSignalPacket = {
        type: 'SEND_MESSAGE',
        recipientId: 'orderManager',
        payload: {
            action: 'CONSENSUS_SIGNAL_RESPONSE',
            mode: 'REAL',
            singleSignal: {
                consensus: consensusType,
                confidence: '75.0%',
                strategyName: 'Dedicated Real Money Dashboard Test Signal',
                entry: 23200
            }
        }
    };

    ws.send(JSON.stringify(testSignalPacket));
    addLogLine(`⚡ Triggered Test REAL ${consensusType} Signal for Spot ₹23200...`);
}

function closeRealPositionManual() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
        type: 'SEND_MESSAGE',
        recipientId: 'orderManager',
        payload: {
            action: 'CLOSE_REAL_POSITION_MANUAL'
        }
    }));
    addLogLine(`🛑 Sent Manual Exit Request for active real Dhan position...`);
}

function addLogLine(msg) {
    const container = document.getElementById('logsContainer');
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
}

function formatRupee(val) {
    const num = Number(val || 0);
    const formatted = Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${num >= 0 ? '+' : '-'}₹${formatted}`;
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
});
