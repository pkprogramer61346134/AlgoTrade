// Dedicated Master Consensus Engine Terminal Frontend JS Engine
let ws = null;

const CORE_STRATEGIES = [
    { id: 'STRAT_1', name: 'Supertrend + VWAP Intraday Scalper', winrate: '73.5%', r: '1:2.2', vote: 'NO (HOLD)', reason: 'Price near VWAP. Awaiting breakout.' },
    { id: 'STRAT_2', name: '15-Min ORB + RVOL Trend', winrate: '68.8%', r: '1:2.5', vote: 'NO (HOLD)', reason: '15-Min Opening Range in progress.' },
    { id: 'STRAT_3', name: 'EMA 20/50 Golden Cross + RSI', winrate: '67.2%', r: '1:2.0', vote: 'NO (HOLD)', reason: 'EMA 20/50 aligned. RSI = 54.' },
    { id: 'STRAT_4', name: 'Liquidity Sweep Wick Reversal', winrate: '71.4%', r: '1:2.2', vote: 'NO (HOLD)', reason: 'No wick sweep detected.' },
    { id: 'STRAT_5', name: 'Multi-Indicator Triple Confluence', winrate: '76.8%', r: '1:2.8', vote: 'NO (HOLD)', reason: 'Supertrend + VWAP + RVOL sync pending.' },
    { id: 'STRAT_6', name: 'Triple EMA (10/20/50) Stacked Trend', winrate: '77.5%', r: '1:2.8', vote: 'NO (HOLD)', reason: 'EMA 10 > 20 > 50 stacking condition.' },
    { id: 'STRAT_7', name: 'Supertrend + MACD Zero-Cross Rider', winrate: '75.2%', r: '1:2.8', vote: 'NO (HOLD)', reason: 'MACD Histogram neutral.' },
    { id: 'STRAT_8', name: 'Donchian 20-Period Channel Breakout', winrate: '74.8%', r: '1:2.8', vote: 'NO (HOLD)', reason: 'Price inside 20-period Donchian bounds.' },
    { id: 'STRAT_9', name: 'ATR Volatility Expansion Surge', winrate: '72.8%', r: '1:3.0', vote: 'NO (HOLD)', reason: 'ATR expansion threshold = 1.2x.' },
    { id: 'STRAT_10', name: 'Previous Day Level (PDH/PDL) Breakout', winrate: '75.5%', r: '1:2.8', vote: 'NO (HOLD)', reason: 'Trading within PDH/PDL range.' }
];

function connectWebSocket() {
    const wsUrl = `ws://${window.location.hostname || 'localhost'}:8080`;
    console.log(`🔌 Connecting to AlgoTrade WebSocket Network at ${wsUrl}...`);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✅ WebSocket Connected!');
        updateConnectionBadge(true);
        ws.send(JSON.stringify({ type: 'REGISTER', clientId: 'headTerminalUI' }));
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

    // Direct Nifty Spot Tick handling
    if (payload.action === 'HEAD_NIFTY_SPOT_TICK' || payload.type === 'LIVE_NIFTY_TICK' || payload.action === 'LIVE_NIFTY_TICK' || payload.spotPrice || payload.ltp) {
        const spot = payload.spotPrice || payload.ltp || payload.entry;
        if (spot) {
            updateNiftySpotPriceUI(spot);
        }
    }

    if (payload.action === 'HEAD_SIGNAL_TELEMETRY' || payload.singleSignal || payload.type === 'CONSENSUS_UPDATE') {
        const signal = payload.singleSignal || payload;
        const execSettings = payload.execSettings || {};
        updateConsensusDashboard(signal, execSettings);
    }
}

function updateNiftySpotPriceUI(spotPrice) {
    const num = Number(spotPrice);
    if (!num || isNaN(num)) return;
    const formatted = num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const el = document.getElementById('niftySpotVal');
    if (el) {
        el.innerText = `₹${formatted}`;
        el.classList.add('tick-flash');
        setTimeout(() => el.classList.remove('tick-flash'), 400);
    }
}

function updateConsensusDashboard(signal, execSettings = {}) {
    if (!signal) return;

    if (signal.entry || signal.spotPrice) {
        updateNiftySpotPriceUI(signal.entry || signal.spotPrice);
    }

    const consensus = (signal.consensus || 'WAITING').toUpperCase();
    const confidence = signal.confidence || '0.0%';
    const buyVotes = Number(signal.buyVotes || signal.stratBuyCount || 0);
    const sellVotes = Number(signal.sellVotes || signal.stratSellCount || 0);
    const totalStrats = 10;
    const holdVotes = Math.max(0, totalStrats - buyVotes - sellVotes);

    // 1. Update Consensus KPI
    const consensusEl = document.getElementById('kpiConsensusSignal');
    consensusEl.innerText = consensus;
    consensusEl.className = `kpi-value ${consensus === 'BUY' ? 'val-green' : (consensus === 'SELL' ? 'val-red' : 'val-amber')}`;
    document.getElementById('kpiSignalConfidence').innerText = `Confidence Score: ${confidence}`;

    // 2. Update Market Trend (UP / DOWN / SIDEWAYS)
    const trendEl = document.getElementById('kpiMarketTrend');
    const trendSubtext = document.getElementById('kpiTrendSubtext');
    
    if (consensus === 'BUY' || buyVotes > sellVotes) {
        trendEl.innerText = 'UP ⬆️';
        trendEl.className = 'kpi-value val-green';
        trendSubtext.innerText = `BULLISH TREND (${buyVotes}/${totalStrats} STRATEGIES YES)`;
    } else if (consensus === 'SELL' || sellVotes > buyVotes) {
        trendEl.innerText = 'DOWN ⬇️';
        trendEl.className = 'kpi-value val-red';
        trendSubtext.innerText = `BEARISH TREND (${sellVotes}/${totalStrats} STRATEGIES YES)`;
    } else {
        trendEl.innerText = 'SIDEWAYS ➡️';
        trendEl.className = 'kpi-value val-amber';
        trendSubtext.innerText = `NEUTRAL / CONSOLIDATION RANGE`;
    }

    // 3. Update Votes KPI & Panel Subtitle
    document.getElementById('kpiStrategyVotes').innerText = `Votes: ${buyVotes} BUY / ${sellVotes} SELL`;
    document.getElementById('liveVotesSummary').innerText = `Live Signals: ${buyVotes} YES (BUY) | ${sellVotes} YES (SELL) | ${holdVotes} NO (HOLD)`;

    // 4. Update Strategy States if strategy array exists
    const strategyStates = signal.strategyStates || signal.subEngineVotes || signal.activeSignals;
    if (Array.isArray(strategyStates)) {
        strategyStates.forEach((st, idx) => {
            if (CORE_STRATEGIES[idx]) {
                const isBuy = st.vote === 'BUY' || st.triggered && consensus === 'BUY';
                const isSell = st.vote === 'SELL' || st.triggered && consensus === 'SELL';
                if (isBuy) {
                    CORE_STRATEGIES[idx].vote = 'YES (BUY)';
                    CORE_STRATEGIES[idx].reason = st.reason || 'Price > VWAP + Supertrend Bullish Signal';
                } else if (isSell) {
                    CORE_STRATEGIES[idx].vote = 'YES (SELL)';
                    CORE_STRATEGIES[idx].reason = st.reason || 'Price < VWAP + Supertrend Bearish Signal';
                } else {
                    CORE_STRATEGIES[idx].vote = 'NO (HOLD)';
                    CORE_STRATEGIES[idx].reason = st.reason || 'Waiting for trigger confluence';
                }
            }
        });
    }

    // 5. Update Routing Settings
    const mode = (execSettings.routingMode || 'BOTH').toUpperCase();
    document.getElementById('routingModeText').innerText = `${mode} (ROUTING)`;
    document.getElementById('kpiRoutingMode').innerText = `Active Mode: ${mode}`;

    renderStrategiesGrid();
    addLogLine(`🧠 Consensus Signal Evaluated: [${consensus}] (${confidence}) | Trend: ${trendEl.innerText}`);
}

function renderStrategiesGrid() {
    const container = document.getElementById('strategiesGrid');
    let html = '';
    CORE_STRATEGIES.forEach((s) => {
        let badgeClass = 'no-hold';
        if (s.vote.includes('BUY')) badgeClass = 'yes-buy';
        else if (s.vote.includes('SELL')) badgeClass = 'yes-sell';

        html += `
            <div class="strat-card ${badgeClass}">
                <div class="strat-header">
                    <span class="strat-title">${s.name}</span>
                    <span class="badge-vote ${badgeClass}">${s.vote}</span>
                </div>
                <div class="strat-details">
                    <span>Target R:R ${s.r}</span>
                    <span class="strat-winrate">Winrate: ${s.winrate}</span>
                </div>
                <div class="strat-reason">🔍 ${s.reason}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function triggerConsensusTest(consensusType) {
    const isBuy = consensusType === 'BUY';
    const totalStrats = CORE_STRATEGIES.length;
    let buyVotes = 0;
    let sellVotes = 0;

    // Simulate realistic 10-strategy YES / NO votes for testing UI
    CORE_STRATEGIES.forEach((s, idx) => {
        if (isBuy) {
            if (idx < 7) {
                s.vote = 'YES (BUY)';
                s.reason = '✅ Bullish Confluence: Price > VWAP + RVOL > 2.0x';
                buyVotes++;
            } else {
                s.vote = 'NO (HOLD)';
                s.reason = '⏳ Neutral: RSI in mid-range threshold';
            }
        } else {
            if (idx < 8) {
                s.vote = 'YES (SELL)';
                s.reason = '🚨 Bearish Confluence: Supertrend Red + EMA Downstack';
                sellVotes++;
            } else {
                s.vote = 'NO (HOLD)';
                s.reason = '⏳ Neutral: Price inside Donchian bounds';
            }
        }
    });

    const testSignal = {
        consensus: consensusType,
        confidence: isBuy ? '78.5%' : '82.0%',
        strategyName: isBuy ? 'Triple EMA + Supertrend Bullish Confluence' : 'Supertrend + VWAP Bearish Breakdown',
        buyVotes,
        sellVotes,
        entry: 23200
    };

    updateConsensusDashboard(testSignal, { routingMode: 'BOTH' });

    if (ws && ws.readyState === WebSocket.OPEN) {
        const testPacket = {
            type: 'SEND_MESSAGE',
            recipientId: 'consensusEngine',
            payload: {
                action: 'EVALUATE_CONSENSUS',
                mode: 'BOTH',
                singleSignal: testSignal
            }
        };
        ws.send(JSON.stringify(testPacket));
    }
    addLogLine(`⚡ Evaluated ${consensusType} Consensus: Trend is ${isBuy ? 'UP ⬆️' : 'DOWN ⬇️'} (${isBuy ? buyVotes : sellVotes}/10 Strategies YES)`);
}

function addLogLine(msg) {
    const container = document.getElementById('logsContainer');
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    renderStrategiesGrid();
    connectWebSocket();
});
