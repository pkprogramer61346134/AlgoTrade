let equityChartInstance = null;

// Tab Switching
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabId === 'backtest') {
        const btBtn = document.querySelectorAll('.tab-btn')[0];
        if (btBtn) btBtn.classList.add('active');
        const btContent = document.getElementById('tab-backtest');
        if (btContent) btContent.classList.add('active');
        window.location.hash = 'backtest';
    } else {
        const liveBtn = document.querySelectorAll('.tab-btn')[1];
        if (liveBtn) liveBtn.classList.add('active');
        const liveContent = document.getElementById('tab-live');
        if (liveContent) liveContent.classList.add('active');
        window.location.hash = 'live';
    }
}

// 1. Run All-Time Historical Backtest
async function runFullBacktest() {
    const btn = document.querySelector('.action-bar button');
    if (btn) {
        btn.innerHTML = '<span>⏳</span> Running All-Time Backtest...';
        btn.disabled = true;
    }

    try {
        const response = await fetch('/api/backtest', { method: 'POST' });
        const data = await response.json();

        if (data.status === 'success' && data.results.length > 0) {
            renderBacktestResults(data.results);
        }
    } catch (e) {
        alert('Backtest failed: ' + e.message);
    } finally {
        if (btn) {
            btn.innerHTML = '<span>🚀</span> Run All-Time Backtest';
            btn.disabled = false;
        }
    }
}

// 1b. Run Custom Date & Capital Analysis
async function runCustomAnalysis() {
    const strategyId = 'consensus_master_head';
    const startDate = document.getElementById('custom-start-date').value;
    const endDate = document.getElementById('custom-end-date').value;
    const initialCapital = document.getElementById('custom-capital').value || 10000;
    const riskRewardRatio = 3.0;

    const btn = document.querySelector('button[onclick="runCustomAnalysis()"]');
    if (btn) {
        btn.innerHTML = '<span>⏳</span> Analyzing Date...';
        btn.disabled = true;
    }

    try {
        const response = await fetch('/api/custom-backtest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                strategyId,
                startDate,
                endDate,
                initialCapital: Number(initialCapital),
                riskRewardRatio: riskRewardRatio,
                capitalUsagePct: 100
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            renderCustomAnalysisResults(data);
        } else {
            alert('⚠️ ' + (data.message || 'No trades found for selected date'));
        }
    } catch (e) {
        alert('Custom analysis failed: ' + e.message);
    } finally {
        if (btn) {
            btn.innerHTML = '<span>🔍</span> Analyze Selected Date';
            btn.disabled = false;
        }
    }
}

// Render Custom Analysis Results
function renderCustomAnalysisResults(res) {
    // Update KPI Cards
    const pnlColor = res.netPnL >= 0 ? 'var(--success)' : 'var(--danger)';
    document.getElementById('kpi-pnl').innerText = `₹${res.netPnL.toLocaleString()}`;
    document.getElementById('kpi-pnl').style.color = pnlColor;
    document.getElementById('kpi-return').innerText = `${res.returnPct >= 0 ? '+' : ''}${res.returnPct}% Return on ₹${res.initialCapital.toLocaleString()}`;
    document.getElementById('kpi-winrate').innerText = `${res.winRatePct}%`;
    document.getElementById('kpi-trades').innerText = `${res.winCount} Wins / ${res.lossCount} Losses (${res.totalTrades} Total Trades)`;
    document.getElementById('kpi-drawdown').innerText = `${res.maxDrawdownPct}%`;
    document.getElementById('kpi-pf').innerText = res.profitFactor;

    // Update Report Table
    const tbody = document.getElementById('backtest-report-tbody');
    tbody.innerHTML = '';

    if (res.tradesList && res.tradesList.length > 0) {
        res.tradesList.forEach(t => {
            const tr = document.createElement('tr');
            const itemPnlColor = t.pnl >= 0 ? 'var(--success)' : 'var(--danger)';
            tr.innerHTML = `
                <td>📅 ${t.date} ${t.time}</td>
                <td style="font-weight: 700; color: #fff;">${t.optionSymbol} (${t.numLots} Lot / ${t.quantity} Qty)</td>
                <td><span class="badge ${t.result === 'WIN' ? 'badge-win' : 'badge-loss'}">${t.type} @ ₹${t.spotPrice}</span></td>
                <td>₹${t.entryPremium}</td>
                <td style="color: var(--danger);">₹${t.optionSL}</td>
                <td style="color: var(--success);">₹${t.optionTarget} (R:R 1:${t.riskRewardRatio})</td>
                <td style="color: ${itemPnlColor}; font-weight: 800;">${t.pnl >= 0 ? '+' : ''}₹${t.pnl.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--warning); padding: 2rem;">
                    ⚪ No trade setup formed on date: <strong>${res.selectedDateRange}</strong> according to strategy rules.
                </td>
            </tr>
        `;
    }

    // Render Custom Equity Chart
    if (res.equityCurve && res.equityCurve.length > 0) {
        renderEquityChart(res.equityCurve);
    }
}

// Render Backtest Results & Chart
function renderBacktestResults(results) {
    const tbody = document.getElementById('backtest-report-tbody');
    tbody.innerHTML = '';

    const bestStrat = results[0];

    // Update KPI Cards
    document.getElementById('kpi-pnl').innerText = `₹${bestStrat.netPnL.toLocaleString()}`;
    document.getElementById('kpi-return').innerText = `+${bestStrat.returnPct}% Return`;
    document.getElementById('kpi-winrate').innerText = `${bestStrat.winRatePct}%`;
    document.getElementById('kpi-trades').innerText = `${bestStrat.winCount} Wins / ${bestStrat.lossCount} Losses (${bestStrat.totalTrades} Total)`;
    document.getElementById('kpi-drawdown').innerText = `${bestStrat.maxDrawdownPct}%`;
    document.getElementById('kpi-pf').innerText = bestStrat.profitFactor;

    // Render Table Rows
    results.forEach(s => {
        const tr = document.createElement('tr');
        const pnlColor = s.netPnL >= 0 ? 'var(--success)' : 'var(--danger)';
        tr.innerHTML = `
            <td style="font-weight: 700; color: #fff;">🟢 ${s.strategyName}</td>
            <td>${s.totalTrades}</td>
            <td><span class="badge badge-win">${s.winRatePct}%</span></td>
            <td style="color: ${pnlColor}; font-weight: 700;">₹${s.netPnL.toLocaleString()}</td>
            <td style="color: ${pnlColor}; font-weight: 700;">+${s.returnPct}%</td>
            <td style="color: var(--danger);">${s.maxDrawdownPct}%</td>
            <td>${s.profitFactor}</td>
        `;
        tbody.appendChild(tr);
    });

    // Render Chart.js Equity Curve
    if (bestStrat.equityCurve && bestStrat.equityCurve.length > 0) {
        renderEquityChart(bestStrat.equityCurve);
    }
}

// Chart.js Equity Curve
function renderEquityChart(equityData) {
    const ctx = document.getElementById('equityChart').getContext('2d');
    const labels = equityData.map(d => d.date);
    const balances = equityData.map(d => d.balance);

    if (equityChartInstance) {
        equityChartInstance.destroy();
    }

    equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Account Equity (₹)',
                data: balances,
                borderColor: '#00f2fe',
                borderWidth: 3,
                fill: true,
                backgroundColor: 'rgba(0, 242, 254, 0.08)',
                tension: 0.25,
                pointRadius: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8a99ad' } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8a99ad' } }
            }
        }
    });
}

function updateLiveControlsUI(data) {
    // 1. Order Switch Toggle
    const toggle = document.getElementById('order-switch-toggle');
    if (toggle) {
        toggle.checked = data.orderSwitchOn;
        updateSwitchUI(data.orderSwitchOn);
    }

    // 2. Live Strategy Select Dropdown
    const liveSelect = document.getElementById('live-strategy-select');
    if (liveSelect && data.activeStrategyId && liveSelect.value !== data.activeStrategyId) {
        liveSelect.value = data.activeStrategyId;
    }

    // 3. Capital Usage Buttons (50% vs 100%)
    const btnCap50 = document.getElementById('btn-cap-50');
    const btnCap100 = document.getElementById('btn-cap-100');
    if (btnCap50 && btnCap100 && data.capitalUsagePct) {
        if (data.capitalUsagePct === 50) {
            btnCap50.style.background = 'var(--secondary-gradient)';
            btnCap100.style.background = 'var(--primary-gradient)';
        } else {
            btnCap50.style.background = 'var(--primary-gradient)';
            btnCap100.style.background = 'var(--secondary-gradient)';
        }
    }

    // 4. Target R:R Buttons (1:1.5 vs 1:2.0 vs 1:3.0)
    const btnRr15 = document.getElementById('btn-rr-15');
    const btnRr20 = document.getElementById('btn-rr-20');
    const btnRr30 = document.getElementById('btn-rr-30');
    if (btnRr15 && btnRr20 && btnRr30 && data.riskRewardRatio) {
        [btnRr15, btnRr20, btnRr30].forEach(b => b.style.background = 'rgba(255,255,255,0.05)');
        if (data.riskRewardRatio === 1.5) btnRr15.style.background = 'var(--secondary-gradient)';
        else if (data.riskRewardRatio === 2.0) btnRr20.style.background = 'var(--secondary-gradient)';
        else if (data.riskRewardRatio === 3.0) btnRr30.style.background = 'var(--secondary-gradient)';
    }
}

// 2. Fetch Live Status & Auto-refresh
async function fetchLiveStatus() {
    try {
        const res = await fetch('/api/live-status');
        const data = await res.json();

        if (data.status === 'success') {
            if (document.getElementById('live-nifty-spot')) {
                document.getElementById('live-nifty-spot').innerText = `₹${data.niftySpotPrice.toLocaleString()}`;
            }
            if (document.getElementById('live-banknifty-spot')) {
                const bnPrice = data.bankNiftySpotPrice || 51200.0;
                document.getElementById('live-banknifty-spot').innerText = `₹${bnPrice.toLocaleString()}`;
            }
            if (document.getElementById('live-pcr')) {
                document.getElementById('live-pcr').innerText = data.livePCR;
            }
            if (document.getElementById('live-account-capital')) {
                document.getElementById('live-account-capital').innerText = `₹${data.accountBalance.toLocaleString()}`;
            }

            // Sync all control settings with persistent defaults
            updateLiveControlsUI(data);

            // Active Position Update
            const activeOrderTbody = document.getElementById('active-order-tbody');
            if (data.activeOrder) {
                document.getElementById('active-position-badge').innerText = '1 Active Order';
                document.getElementById('active-position-badge').className = 'badge badge-win';
                
                if (activeOrderTbody) {
                    activeOrderTbody.innerHTML = `
                        <tr>
                            <td>#${data.activeOrder.orderId}</td>
                            <td style="color: var(--primary); font-weight: 700;">${data.activeOrder.type} Contract</td>
                            <td>₹${data.activeOrder.entryPrice}</td>
                            <td style="color: var(--danger);">₹${data.activeOrder.stopLoss}</td>
                            <td style="color: var(--warning); font-weight: 800;">₹${data.activeOrder.currentSL}</td>
                            <td style="color: var(--success);">₹${data.activeOrder.initialTarget}</td>
                            <td><span class="badge ${data.activeOrder.targetReached ? 'badge-win' : 'badge-info'}">${data.activeOrder.targetReached ? 'TARGET HIT - SL LOCKED' : 'IN PROGRESS'}</span></td>
                        </tr>
                    `;
                }
            } else {
                document.getElementById('active-position-badge').innerText = 'No Active Position';
                document.getElementById('active-position-badge').className = 'badge badge-info';
                if (activeOrderTbody) {
                    activeOrderTbody.innerHTML = `
                        <tr>
                            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No open intraday option positions currently active.</td>
                        </tr>
                    `;
                }
            }

            // Real-Time Trade Signals Stream Render
            const signalsTbody = document.getElementById('live-signals-tbody');
            if (signalsTbody) {
                if (data.recentSignals && data.recentSignals.length > 0) {
                    signalsTbody.innerHTML = data.recentSignals.map(sig => {
                        const sigBadgeClass = (sig.signalType === 'BUY_SIGNAL' || sig.type === 'BUY' || sig.type === 'CE') ? 'badge-win' : 'badge-loss';
                        const premInfo = sig.entryPremium ? `<div style="font-size:0.75rem; color:#00f2fe; margin-top: 2px;">Prem: ₹${sig.entryPremium} (${sig.numLots || 1} Lot / ${sig.quantity || 65} Qty)</div>` : '';
                        return `
                            <tr>
                                <td>${sig.time}</td>
                                <td style="font-weight: 700; color: #fff;">${sig.strategyName}</td>
                                <td><span class="badge ${sigBadgeClass}">${sig.signalType || sig.type}</span></td>
                                <td>₹${sig.spotPrice}</td>
                                <td style="color: var(--primary); font-weight: 700;">${sig.atmStrike} (${sig.optionSymbol || 'NIFTY ATM'}) ${premInfo}</td>
                                <td style="color: var(--danger); font-weight: 700;">₹${sig.optionSL}</td>
                                <td style="color: var(--success); font-weight: 700;">₹${sig.optionTarget} <span style="font-size:0.75rem; color:#a7f3d0;">(R:R 1:${sig.riskRewardRatio || 1.5})</span></td>
                                <td><span class="badge ${sig.orderSwitchOn ? 'badge-win' : 'badge-info'}">${sig.orderSwitchOn ? '🟢 BROKER ORDER' : '🟡 SIGNAL ALERT ONLY'}</span></td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    signalsTbody.innerHTML = `
                        <tr>
                            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                                📡 Listening for live 15-Min ORB Breakout signals on Dhan WebSocket stream...
                            </td>
                        </tr>
                    `;
                }
            }

            // Live Engine Reasoning Logs Render
            if (data.engineLogs && data.engineLogs.length > 0) {
                const consoleDiv = document.getElementById('live-reasoning-console');
                if (consoleDiv) {
                    consoleDiv.innerHTML = data.engineLogs.map(log => {
                        let badgeColor = '#94a3b8'; // gray
                        let textColor = '#cbd5e1';
                        if (log.status === 'BUY_SIGNAL') { badgeColor = '#10b981'; textColor = '#6ee7b7'; }
                        else if (log.status === 'SELL_SIGNAL') { badgeColor = '#ef4444'; textColor = '#fca5a5'; }
                        else if (log.status === 'FLAT') { badgeColor = '#3b82f6'; textColor = '#93c5fd'; }

                        return `
                            <div style="margin-bottom: 0.65rem; border-bottom: 1px dashed rgba(255,255,255,0.07); padding-bottom: 0.5rem;">
                                <span style="color: #64748b; font-weight: 600;">[${log.time}]</span>
                                <span style="background: ${badgeColor}; color: #000; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 800; font-size: 0.75rem; margin: 0 0.4rem;">${log.status}</span>
                                <span style="color: #94a3b8;">Order Mode: <b style="color: #f59e0b;">${log.orderSwitch}</b></span>
                                <div style="margin-top: 0.25rem; color: ${textColor}; font-weight: 500; padding-left: 0.5rem; border-left: 2px solid ${badgeColor};">
                                    ${log.reasoning}
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
        }
    } catch (e) {}
}

// Toggle Order Switch
async function toggleOrderSwitch() {
    const toggle = document.getElementById('order-switch-toggle');
    const isChecked = toggle.checked;

    try {
        const res = await fetch('/api/toggle-order-switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: isChecked })
        });
        const data = await res.json();
        updateSwitchUI(data.orderSwitchOn);
    } catch (e) {
        toggle.checked = !isChecked;
    }
}

function updateSwitchUI(isOn) {
    const statusText = document.getElementById('switch-status-text');
    const cardText = document.getElementById('live-switch-card-text');
    const cardSubtext = document.getElementById('live-switch-subtext');

    if (isOn) {
        statusText.innerText = 'ORDER SWITCH: ON';
        statusText.style.color = 'var(--success)';
        cardText.innerText = '🟢 ON';
        cardText.style.color = 'var(--success)';
        cardSubtext.innerText = 'Automatic Dhan Order Placement Active';
    } else {
        statusText.innerText = 'ORDER SWITCH: OFF';
        statusText.style.color = 'var(--danger)';
        cardText.innerText = '🔴 OFF';
        cardText.style.color = 'var(--danger)';
        cardSubtext.innerText = 'Signal Alert Mode Only (No Broker Order)';
    }
}

// Update Capital Config
async function updateCapitalConfig(pct) {
    updateLiveControlsUI({ capitalUsagePct: pct });
    try {
        const res = await fetch('/api/update-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ capitalUsagePct: pct })
        });
        const data = await res.json();
        updateLiveControlsUI({ capitalUsagePct: data.capitalUsagePct });
    } catch (e) {
        alert('Failed to update config: ' + e.message);
    }
}

// Update Live Risk:Reward Target Config
async function updateRRConfig(rrVal) {
    updateLiveControlsUI({ riskRewardRatio: rrVal });
    try {
        const res = await fetch('/api/update-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ riskRewardRatio: rrVal })
        });
        const data = await res.json();
        updateLiveControlsUI({ riskRewardRatio: data.riskRewardRatio });
    } catch (e) {
        alert('Failed to update Risk:Reward: ' + e.message);
    }
}

// Fetch & Populate Strategies dynamically from /api/strategies
async function fetchStrategies() {
    try {
        const res = await fetch('/api/strategies');
        const data = await res.json();
        if (data.status === 'success' && data.strategies) {
            populateStrategyDropdowns(data.strategies);
        }
    } catch (e) {
        console.warn('Failed to fetch strategies:', e.message);
    }
}

function populateStrategyDropdowns(strategies) {
    const customSelect = document.getElementById('custom-strategy-select');
    const liveSelect = document.getElementById('live-strategy-select');

    if (customSelect) {
        const curVal = customSelect.value;
        customSelect.innerHTML = strategies.map(s => `
            <option value="${s.id}" ${s.id === curVal ? 'selected' : ''}>${s.name}</option>
        `).join('');
    }

    if (liveSelect) {
        const curVal = liveSelect.value;
        liveSelect.innerHTML = strategies.map(s => `
            <option value="${s.id}" ${s.id === curVal ? 'selected' : ''}>${s.name}</option>
        `).join('');
    }
}

// Change Active Live Strategy
async function changeLiveStrategy(strategyId) {
    try {
        const res = await fetch('/api/select-live-strategy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strategyId })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert(`🎯 Live Trading Strategy updated to: ${data.strategyName}`);
        }
    } catch (e) {
        alert('Failed to switch live strategy: ' + e.message);
    }
}

// Initial Load
window.onload = () => {
    const capitalInput = document.getElementById('custom-capital');
    if (capitalInput) {
        capitalInput.addEventListener('input', () => {
            capitalInput.setAttribute('data-auto-synced', 'user_edited');
        });
    }

    if (window.location.hash === '#live') {
        switchTab('live');
    } else if (window.location.hash === '#backtest') {
        switchTab('backtest');
    }

    fetchStrategies();
    runFullBacktest();
    fetchLiveStatus();
    setInterval(fetchLiveStatus, 2000); // Polling every 2s
};
