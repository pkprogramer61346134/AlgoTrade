let equityChartInstance = null;

// Tab Switching
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabId === 'backtest') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('tab-backtest').classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('tab-live').classList.add('active');
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
    const strategyId = document.getElementById('custom-strategy-select').value;
    const startDate = document.getElementById('custom-start-date').value;
    const endDate = document.getElementById('custom-end-date').value;
    const initialCapital = document.getElementById('custom-capital').value || 10000;
    const riskRewardRatio = parseFloat(document.getElementById('custom-rr-ratio').value) || 1.5;

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

// 2. Fetch Live Status & Auto-refresh
async function fetchLiveStatus() {
    try {
        const res = await fetch('/api/live-status');
        const data = await res.json();

        if (data.status === 'success') {
            document.getElementById('live-nifty-spot').innerText = `₹${data.niftySpotPrice.toLocaleString()}`;
            document.getElementById('live-pcr').innerText = data.livePCR;
            document.getElementById('live-account-capital').innerText = `₹${data.accountBalance.toLocaleString()}`;

            // Sync Toggle Switch State
            const toggle = document.getElementById('order-switch-toggle');
            toggle.checked = data.orderSwitchOn;
            updateSwitchUI(data.orderSwitchOn);

            // Active Position Update
            if (data.activeOrder) {
                document.getElementById('active-position-badge').innerText = '1 Active Order';
                document.getElementById('active-position-badge').className = 'badge badge-win';
                
                const tbody = document.getElementById('active-order-tbody');
                tbody.innerHTML = `
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
    try {
        const res = await fetch('/api/update-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ capitalUsagePct: pct })
        });
        const data = await res.json();
        alert(`✅ Capital Usage updated to ${data.capitalUsagePct}%`);
    } catch (e) {
        alert('Failed to update config: ' + e.message);
    }
}

// Initial Load
window.onload = () => {
    runFullBacktest();
    fetchLiveStatus();
    setInterval(fetchLiveStatus, 2000); // Polling every 2s
};
