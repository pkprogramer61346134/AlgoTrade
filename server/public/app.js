let equityChartInstance = null;
let currentJournalFilterMode = null;

// Tab Switching
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabId === 'backtest') {
        const btBtn = document.getElementById('tab-btn-backtest');
        if (btBtn) btBtn.classList.add('active');
        const btContent = document.getElementById('tab-backtest');
        if (btContent) btContent.classList.add('active');
        window.location.hash = 'backtest';
    } else if (tabId === 'simulator') {
        const simBtn = document.getElementById('tab-btn-simulator');
        if (simBtn) simBtn.classList.add('active');
        const simContent = document.getElementById('tab-simulator');
        if (simContent) simContent.classList.add('active');
        window.location.hash = 'simulator';
    } else if (tabId === 'reports') {
        const repBtn = document.getElementById('tab-btn-reports');
        if (repBtn) repBtn.classList.add('active');
        const repContent = document.getElementById('tab-reports');
        if (repContent) repContent.classList.add('active');
        window.location.hash = 'reports';
        loadReportsData();
    } else {
        const liveBtn = document.getElementById('tab-btn-live');
        if (liveBtn) liveBtn.classList.add('active');
        const liveContent = document.getElementById('tab-live');
        if (liveContent) liveContent.classList.add('active');
        window.location.hash = 'live';
    }
}

// Set Execution Mode (Paper vs Real)
async function setExecutionMode(mode) {
    try {
        const res = await fetch('/api/toggle-execution-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode })
        });
        const data = await res.json();
        if (data.status === 'success') {
            updateExecutionModeUI(data.executionMode);
        }
    } catch (e) {
        alert('Failed to set execution mode: ' + e.message);
    }
}

function updateExecutionModeUI(mode) {
    const modeBadge = document.getElementById('mode-display-badge');
    if (modeBadge) {
        if (mode === 'REAL') {
            modeBadge.innerText = '⚡ REAL MONEY (Dhan Broker)';
            modeBadge.className = 'mode-selector-badge real';
        } else {
            modeBadge.innerText = '📄 PAPER MONEY (Configured in JSON)';
            modeBadge.className = 'mode-selector-badge paper';
        }
    }
}

// Close Active Position (Manual Square Off)
async function closeActivePosition() {
    if (!confirm('🛑 Are you sure you want to square off the active position?')) return;

    try {
        const res = await fetch('/api/close-position', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'success') {
            alert('✅ Position successfully squared off.');
            fetchLiveStatus();
        } else {
            alert('⚠️ ' + (data.message || 'Failed to close position'));
        }
    } catch (e) {
        alert('Failed to close position: ' + e.message);
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
    const initialCapital = document.getElementById('custom-capital').value || 100000;
    const riskRewardRatio = 2.0;

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
    if (document.getElementById('kpi-pnl')) {
        const pnlColor = res.netPnL >= 0 ? 'var(--success)' : 'var(--danger)';
        document.getElementById('kpi-pnl').innerText = `${res.netPnL >= 0 ? '+' : ''}₹${res.netPnL.toLocaleString()}`;
        document.getElementById('kpi-pnl').style.color = pnlColor;
    }
    if (document.getElementById('kpi-return')) document.getElementById('kpi-return').innerText = `${res.returnPct >= 0 ? '+' : ''}${res.returnPct}% Return on ₹${res.initialCapital.toLocaleString()}`;
    if (document.getElementById('kpi-winrate')) document.getElementById('kpi-winrate').innerText = `${res.winRatePct}%`;
    if (document.getElementById('kpi-trades')) document.getElementById('kpi-trades').innerText = `${res.winCount} Wins / ${res.lossCount} Losses (${res.totalTrades} Total Trades)`;
    if (document.getElementById('kpi-drawdown')) document.getElementById('kpi-drawdown').innerText = `${res.maxDrawdownPct}%`;
    if (document.getElementById('kpi-pf')) document.getElementById('kpi-pf').innerText = res.profitFactor;

    const thead = document.getElementById('backtest-report-thead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th>Date & Time</th>
                <th>Instrument & Qty</th>
                <th>Type & Spot</th>
                <th>Entry Price</th>
                <th>Stop Loss</th>
                <th>Target</th>
                <th>Trade PnL (₹ & Points)</th>
                <th>Account Balance (₹)</th>
                <th>Trade Remark / Status Note</th>
            </tr>
        `;
    }

    const tbody = document.getElementById('backtest-report-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (res.tradesList && res.tradesList.length > 0) {
        res.tradesList.forEach(t => {
            const tr = document.createElement('tr');
            const rupeePnL = t.pnl !== undefined ? t.pnl : 0;
            const ptsPnL = t.pointsPnL !== undefined ? t.pointsPnL : 0;
            const itemPnlColor = rupeePnL >= 0 ? 'var(--success)' : 'var(--danger)';
            const isWin = (t.result && t.result.includes('WIN')) || t.result === 'TARGET_HIT' || (t.result === 'EOD_SQUAREOFF' && ptsPnL > 0);
            const balVal = t.balanceAfter !== undefined ? t.balanceAfter : 0;
            const balColor = balVal >= res.initialCapital ? 'var(--success)' : 'var(--warning)';

            const entryTimeStr = t.entryTime || t.time || '';
            const symbStr = t.symbol || t.optionSymbol || 'NIFTY 50';
            const entrySpot = t.spotEntryPrice || t.spotPrice || t.entryPremium || 0;
            const slSpot = t.slPrice || t.optionSL || 0;
            const tgtSpot = t.targetPrice || t.target || t.optionTarget || 0;

            let remarkText = t.statusNote || "🕒 EOD CLOSE (SQUAREOFF)";
            let remarkClass = "badge-info";
            if (t.result === "TARGET_HIT" || (t.statusNote && t.statusNote.includes("TARGET"))) {
                remarkText = "🎯 TARGET HIT (SUCCESS)";
                remarkClass = "badge-win";
            } else if (t.result === "SL_HIT" || (t.statusNote && t.statusNote.includes("STOP LOSS"))) {
                remarkText = "🛑 STOP LOSS HIT";
                remarkClass = "badge-loss";
            } else if (t.result === "BREAKEVEN_SL" || (t.statusNote && t.statusNote.includes("BREAKEVEN"))) {
                remarkText = "🛡️ BREAKEVEN PROTECTED";
                remarkClass = "badge-info";
            } else if (t.result === "EOD_SQUAREOFF") {
                if (ptsPnL > 0 || rupeePnL > 0) {
                    remarkText = "🕒 EOD CLOSE (SUCCESS PROFIT)";
                    remarkClass = "badge-win";
                } else {
                    remarkText = "🕒 EOD CLOSE (SQUAREOFF)";
                    remarkClass = "badge-info";
                }
            }

            let rrText = String(t.riskRewardRatio || '2.0');
            if (!rrText.includes(':')) {
                rrText = `1:${rrText}`;
            }

            tr.innerHTML = `
                <td>📅 ${t.date} ${entryTimeStr}</td>
                <td style="font-weight: 700; color: #fff;">${symbStr} (${t.numLots || 1} Lot / ${t.quantity} Qty)</td>
                <td><span class="badge ${isWin ? 'badge-win' : 'badge-loss'}">${t.type} @ ₹${entrySpot}</span></td>
                <td style="font-weight: 700;">₹${entrySpot}</td>
                <td style="color: var(--danger); font-weight: 700;">₹${slSpot}</td>
                <td style="color: var(--success); font-weight: 700;">₹${tgtSpot} <span style="font-size:0.75rem; color:#a7f3d0;">(R:R ${rrText})</span></td>
                <td style="color: ${itemPnlColor}; font-weight: 800;">${rupeePnL >= 0 ? '+' : ''}₹${rupeePnL.toLocaleString()} <span style="font-size: 0.75rem; opacity: 0.9;">(${ptsPnL >= 0 ? '+' : ''}${ptsPnL} pts)</span></td>
                <td style="color: ${balColor}; font-weight: 800; font-family: var(--font-mono);">₹${balVal.toLocaleString()}</td>
                <td><span class="badge ${remarkClass}">${remarkText}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; color: var(--warning); padding: 2rem;">
                    ⚪ No trade setup formed on date: <strong>${res.selectedDateRange}</strong> according to strategy rules.
                </td>
            </tr>
        `;
    }

    if (res.equityCurve && res.equityCurve.length > 0) {
        renderEquityChart(res.equityCurve);
    }
}

// Render Backtest Results & Chart
function renderBacktestResults(results) {
    const tbody = document.getElementById('backtest-report-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const bestStrat = results[0];

    document.getElementById('kpi-pnl').innerText = `${bestStrat.netPnL >= 0 ? '+' : ''}${bestStrat.netPnL.toLocaleString()} pts`;
    document.getElementById('kpi-return').innerText = `${bestStrat.returnPct >= 0 ? '+' : ''}${bestStrat.returnPct}% Return`;
    document.getElementById('kpi-winrate').innerText = `${bestStrat.winRatePct}%`;
    document.getElementById('kpi-trades').innerText = `${bestStrat.winCount} Wins / ${bestStrat.lossCount} Losses (${bestStrat.totalTrades} Total)`;
    document.getElementById('kpi-drawdown').innerText = `${bestStrat.maxDrawdownPct}%`;
    document.getElementById('kpi-pf').innerText = bestStrat.profitFactor;

    results.forEach(s => {
        const tr = document.createElement('tr');
        const pnlColor = s.netPnL >= 0 ? 'var(--success)' : 'var(--danger)';
        tr.innerHTML = `
            <td style="font-weight: 700; color: #fff;">🟢 ${s.strategyName}</td>
            <td>${s.totalTrades}</td>
            <td><span class="badge badge-win">${s.winRatePct}%</span></td>
            <td style="color: ${pnlColor}; font-weight: 700;">${s.netPnL >= 0 ? '+' : ''}${s.netPnL.toLocaleString()} pts</td>
            <td style="color: ${pnlColor}; font-weight: 700;">+${s.returnPct}%</td>
            <td style="color: var(--danger);">${s.maxDrawdownPct}%</td>
            <td>${s.profitFactor}</td>
        `;
        tbody.appendChild(tr);
    });

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
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8a99ad' } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8a99ad' } }
            }
        }
    });
}

function updateLiveControlsUI(data) {
    if (data.executionMode) {
        updateExecutionModeUI(data.executionMode);
    }
}

// 2. Fetch Live Status & Auto-refresh
async function fetchLiveStatus() {
    try {
        const res = await fetch('/api/live-status');
        const data = await res.json();

        if (data.status === 'success') {
            // Update System Health Alert Banner & Dhan Token Status Card
            const banner = document.getElementById('system-health-banner');
            const bDot = document.getElementById('health-banner-dot');
            const bTitle = document.getElementById('health-banner-title');
            const bText = document.getElementById('health-banner-text');
            const bSync = document.getElementById('health-banner-sync');

            const tokenValCard = document.getElementById('live-token-status');
            const tokenSubCard = document.getElementById('live-token-subtext');

            const syncTimeStr = new Date(data.lastSyncTimestamp || Date.now()).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
            if (bSync) bSync.innerText = `Last Sync: ${syncTimeStr}`;

            if (data.dhanTokenStatus === 'COOLDOWN') {
                if (banner) banner.className = 'system-alert-banner alert-warning';
                if (bDot) bDot.className = 'status-dot warning';
                if (bTitle) bTitle.innerText = '⚠️ DHAN API TOKEN RATE-LIMIT COOLDOWN (HTTP 401)';
                if (bText) bText.innerText = data.dhanTokenMessage || 'API Rate Limit active. Automatic TOTP refresh will retry shortly.';
                if (tokenValCard) {
                    tokenValCard.innerText = '⚠️ COOLDOWN';
                    tokenValCard.style.color = '#ffea00';
                }
                if (tokenSubCard) tokenSubCard.innerText = 'HTTP 401 Rate Limited';
            } else if (data.dhanTokenStatus === 'EXPIRED' || data.dhanTokenStatus === 'ERROR') {
                if (banner) banner.className = 'system-alert-banner alert-danger';
                if (bDot) bDot.className = 'status-dot inactive';
                if (bTitle) bTitle.innerText = '🔴 SYSTEM API ERROR ALERT';
                if (bText) bText.innerText = data.dhanTokenMessage || data.lastDhanError || 'API token error detected.';
                if (tokenValCard) {
                    tokenValCard.innerText = '🔴 ERROR';
                    tokenValCard.style.color = 'var(--danger)';
                }
                if (tokenSubCard) tokenSubCard.innerText = data.lastDhanError || 'Authentication Error';
            } else {
                if (banner) banner.className = 'system-alert-banner alert-success';
                if (bDot) bDot.className = 'status-dot active';
                if (bTitle) bTitle.innerText = '🟢 ALL SYSTEMS OPERATIONAL';
                if (bText) bText.innerText = 'Dhan Broker API Token Active & Live Market Feed Connected.';
                if (tokenValCard) {
                    tokenValCard.innerText = '🟢 VALID';
                    tokenValCard.style.color = 'var(--success)';
                }
                if (tokenSubCard) tokenSubCard.innerText = 'Auto-Refresh TOTP Active';
            }

            // Update Pre-Market 9:15 AM Readiness Checklist UI
            if (data.preMarketReadiness) {
                const pm = data.preMarketReadiness;
                const pmTitle = document.getElementById('premarket-status-title');
                const pmDetails = document.getElementById('premarket-checklist-details');
                const pmBadge = document.getElementById('premarket-sync-badge');
                const pmDot = document.getElementById('premarket-ready-dot');

                if (pm.isReady) {
                    if (pmTitle) {
                        pmTitle.innerText = pm.statusText || '🟢 9:15 AM PRE-MARKET READINESS: 100% OPERATIONAL';
                        pmTitle.style.color = '#10b981';
                    }
                    if (pmDot) pmDot.className = 'status-dot active';
                    if (pmBadge) {
                        pmBadge.innerText = `Synced at ${pm.lastSyncTime || '08:45 AM'}`;
                        pmBadge.className = 'badge badge-win';
                    }
                } else {
                    if (pmTitle) {
                        pmTitle.innerText = pm.statusText || '⚠️ PRE-MARKET SYNCING...';
                        pmTitle.style.color = '#ffea00';
                    }
                    if (pmDot) pmDot.className = 'status-dot warning';
                    if (pmBadge) {
                        pmBadge.innerText = 'Syncing...';
                        pmBadge.className = 'badge badge-info';
                    }
                }

                if (pmDetails && Array.isArray(pm.checklist) && pm.checklist.length > 0) {
                    pmDetails.innerHTML = pm.checklist.map(item => `<span>${item}</span>`).join('');
                }
            }

            if (document.getElementById('live-nifty-spot')) {
                document.getElementById('live-nifty-spot').innerText = `₹${data.niftySpotPrice.toLocaleString()}`;
            }
            if (document.getElementById('live-banknifty-spot')) {
                const bnPrice = data.bankNiftySpotPrice || 0;
                document.getElementById('live-banknifty-spot').innerText = `₹${bnPrice.toLocaleString()}`;
            }
            if (document.getElementById('live-pcr')) {
                document.getElementById('live-pcr').innerText = data.livePCR;
            }
            if (document.getElementById('live-account-capital')) {
                const isReal = data.executionMode === 'REAL';
                const bal = data.accountBalance !== undefined ? data.accountBalance : 10000;
                const activePnL = data.activeOrder ? (data.activeOrder.pnlRupees || 0) : 0;
                
                let pnlTag = '';
                if (data.activeOrder && activePnL !== 0) {
                    const color = activePnL >= 0 ? 'var(--success)' : 'var(--danger)';
                    const sign = activePnL >= 0 ? '+' : '';
                    pnlTag = ` <span style="font-size:0.75rem; color:${color}; font-weight:700;">(${sign}₹${activePnL.toLocaleString()})</span>`;
                }

                document.getElementById('live-account-capital').innerHTML = `₹${bal.toLocaleString()}${pnlTag}`;
                
                const subtext = document.getElementById('live-capital-subtext');
                if (subtext) {
                    if (isReal) {
                        subtext.innerText = 'Dhan API Real Account Capital';
                        subtext.style.color = '#38bdf8';
                    } else {
                        subtext.innerText = data.activeOrder ? 'Paper Capital (Live Unrealized PnL)' : 'Paper Trading Capital (Dynamic PnL Enabled)';
                        subtext.style.color = 'var(--text-muted)';
                    }
                }
            }

            updateLiveControlsUI(data);

            // Active Position Update & 2-Way Handshake Status
            const activeOrderTbody = document.getElementById('active-order-tbody');
            const exitBtn = document.getElementById('exit-position-btn');

            if (data.activeOrder) {
                const pos = data.activeOrder;
                const badge = document.getElementById('active-position-badge');
                if (badge) {
                    badge.innerText = `1 ACTIVE POSITION (${pos.mode || 'PAPER'})`;
                    badge.className = 'badge badge-win';
                }
                if (exitBtn) exitBtn.style.display = 'inline-flex';

                if (activeOrderTbody) {
                    const modeClass = pos.mode === 'REAL' ? 'mode-selector-badge real' : 'mode-selector-badge paper';
                    const modeLabel = pos.mode === 'REAL' ? '⚡ REAL' : '📄 PAPER';
                    const targetBadge = pos.t1Reached ? '🎯 T1 HIT - SL TRAILED' : '⏳ IN PROGRESS';
                    const targetBadgeClass = pos.t1Reached ? 'badge-win' : 'badge-info';

                    const curPrem = pos.currentPremium || pos.optionPremiumPrice;
                    const premDiff = Number((curPrem - pos.optionPremiumPrice).toFixed(2));
                    const premSign = premDiff >= 0 ? '▲ +' : '▼ ';
                    const premColor = premDiff >= 0 ? 'var(--success)' : 'var(--danger)';

                    const pnlVal = pos.pnlRupees !== undefined ? pos.pnlRupees : 0;
                    const pnlPct = pos.pnlPct !== undefined ? pos.pnlPct : 0;
                    const pnlColor = pnlVal >= 0 ? 'var(--success)' : 'var(--danger)';
                    const pnlSign = pnlVal >= 0 ? '+' : '';

                    activeOrderTbody.innerHTML = `
                        <tr>
                            <td><span class="${modeClass}">${modeLabel}</span></td>
                            <td style="font-family: var(--font-mono); font-size: 0.8rem;">#${pos.orderId}</td>
                            <td style="color: var(--primary); font-weight: 700;">${pos.optionSymbol} (${pos.numLots || 1} Lot / ${pos.quantity} Qty)</td>
                            <td style="font-weight: 700;">₹${pos.optionPremiumPrice}</td>
                            <td style="font-weight: 800; color: ${premColor};">₹${curPrem} <span style="font-size: 0.75rem; font-weight: 600;">(${premSign}₹${Math.abs(premDiff)})</span></td>
                            <td style="color: var(--warning); font-weight: 800;">₹${pos.currentSL}</td>
                            <td style="color: var(--success); font-weight: 800;">₹${pos.target || pos.target1} (R:R 1:3)</td>
                            <td>
                                <div style="font-weight: 800; font-size: 0.95rem; color: ${pnlColor}; margin-bottom: 2px;">${pnlSign}₹${pnlVal.toLocaleString()} (${pnlSign}${pnlPct}%)</div>
                                <span class="badge ${targetBadgeClass}" style="font-size: 0.7rem;">${targetBadge}</span>
                            </td>
                        </tr>
                    `;
                }
            } else {
                const badge = document.getElementById('active-position-badge');
                if (badge) {
                    badge.innerText = 'No Active Position';
                    badge.className = 'badge badge-info';
                }
                if (exitBtn) exitBtn.style.display = 'none';

                if (activeOrderTbody) {
                    activeOrderTbody.innerHTML = `
                        <tr>
                            <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No open intraday option positions currently active. Signal scanning is active.</td>
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
                        const modeText = sig.executionMode === 'REAL' ? '⚡ REAL MONEY' : '📄 DUMMY MONEY';
                        return `
                            <tr>
                                <td>${sig.time}</td>
                                <td style="font-weight: 700; color: #fff;">${sig.strategyName}</td>
                                <td><span class="badge ${sigBadgeClass}">${sig.signalType || sig.type}</span></td>
                                <td>₹${sig.spotPrice}</td>
                                <td style="color: var(--primary); font-weight: 700;">${sig.atmStrike} (${sig.optionSymbol || 'NIFTY ATM'}) ${premInfo}</td>
                                <td style="color: var(--danger); font-weight: 700;">₹${sig.optionSL}</td>
                                <td style="color: var(--success); font-weight: 700;">₹${sig.optionTarget} <span style="font-size:0.75rem; color:#a7f3d0;">(R:R ${sig.riskRewardRatio || '2.0'})</span></td>
                                <td><span class="badge ${sig.orderSwitchOn ? 'badge-win' : 'badge-info'}">${sig.orderSwitchOn ? `🟢 ${modeText}` : '🟡 SIGNAL ALERT ONLY'}</span></td>
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
                        let badgeColor = '#94a3b8';
                        let textColor = '#cbd5e1';
                        if (log.status === 'BUY_SIGNAL') { badgeColor = '#10b981'; textColor = '#6ee7b7'; }
                        else if (log.status === 'SELL_SIGNAL') { badgeColor = '#ef4444'; textColor = '#fca5a5'; }
                        else if (log.status === 'POSITION_CLOSED') { badgeColor = '#8b5cf6'; textColor = '#c084fc'; }
                        else if (log.status === 'T1_TRAILED') { badgeColor = '#f59e0b'; textColor = '#fde047'; }
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

            // Render System Error Alert Card & 10-Engine Voting Grid
            updateSystemErrorUI(data);
            renderEngineVotingGrid(data);
        }
    } catch (e) {
        console.warn("fetchLiveStatus error:", e);
    }
}

function updateSystemErrorUI(data) {
    const errorCard = document.getElementById('system-error-alert-card');
    const errorTitle = document.getElementById('system-error-title');
    const errorMsg = document.getElementById('system-error-message');
    const errorTime = document.getElementById('system-error-time');

    if (!errorCard) return;

    const lastErr = data.lastSystemError || (data.recentSystemErrors && data.recentSystemErrors[0]);

    if (lastErr) {
        errorCard.style.display = 'block';
        if (errorTitle) {
            errorTitle.innerText = `🚨 SYSTEM ERROR DETECTED [MODULE: ${lastErr.module || 'SYSTEM'}]`;
        }
        if (errorMsg) {
            const stackSnippet = (lastErr.stack && lastErr.stack[0]) ? ` (${lastErr.stack[0]})` : '';
            errorMsg.innerText = `${lastErr.message || 'System operation warning'}${stackSnippet}`;
        }
        if (errorTime) {
            errorTime.innerText = `${lastErr.timestamp || lastErr.time || 'Logged Recently'}`;
            errorTime.className = 'badge badge-loss';
        }
    } else if (data.dhanTokenStatus === "ERROR" || data.dhanTokenStatus === "COOLDOWN") {
        errorCard.style.display = 'block';
        if (errorTitle) {
            errorTitle.innerText = `⚠️ BROKER API ERROR [${data.dhanTokenStatus}]`;
        }
        if (errorMsg) {
            errorMsg.innerText = data.dhanTokenMessage || data.lastDhanError || 'Dhan broker API connection error.';
        }
        if (errorTime) {
            errorTime.innerText = 'Live Feed Error';
            errorTime.className = 'badge badge-loss';
        }
    } else {
        errorCard.style.display = 'none';
    }
}

function renderEngineVotingGrid(data) {
    const gridDiv = document.getElementById('live-engine-voting-grid');
    if (!gridDiv) return;

    let subVotes = (data && Array.isArray(data.subEngineVotes) && data.subEngineVotes.length > 0) ? data.subEngineVotes : null;

    // Fallback: Parse voteDetails from engineLogs if subEngineVotes is missing
    if (!subVotes) {
        let targetLog = "";
        if (data && data.engineLogs && Array.isArray(data.engineLogs)) {
            const foundLog = data.engineLogs.find(l => l.reasoning && l.reasoning.includes("Engine 1"));
            if (foundLog) {
                targetLog = foundLog.reasoning;
            } else if (data.engineLogs[0]) {
                targetLog = data.engineLogs[0].reasoning || "";
            }
        }

        const enginesDef = [
            { id: 1, name: "Volume Surge", desc: "RVOL >= 1.25x Institutional Volume", keyword: "Engine 1" },
            { id: 2, name: "RSI Momentum", desc: "RSI > 54 (Bull) / RSI < 46 (Bear)", keyword: "Engine 2" },
            { id: 3, name: "EMA 50 Trend", desc: "Spot Price relative to 50 EMA", keyword: "Engine 3" },
            { id: 4, name: "Intraday VWAP", desc: "Institutional Volume Weighted Avg Price", keyword: "Engine 4" },
            { id: 5, name: "Supertrend", desc: "ATR Volatility Trailing Direction", keyword: "Engine 5" },
            { id: 6, name: "Price Action", desc: "Bullish / Bearish Engulfing Pattern", keyword: "Engine 6" },
            { id: 7, name: "MACD Momentum", desc: "MACD Line & Signal Histogram Crossover", keyword: "Engine 7" },
            { id: 8, name: "Prev Day Levels", desc: "Previous Day High / Low Level Breakout", keyword: "Engine 8" },
            { id: 9, name: "Bank Nifty Heavyweight", desc: "~34% Nifty Weight Alignment Check", keyword: "Engine 9" },
            { id: 10, name: "SMC Liquidity Sweep", desc: "Institutional Sweep Reversal & Zone Guard", keyword: "Engine 10" }
        ];

        subVotes = enginesDef.map(eng => {
            let isBull = targetLog.includes(`${eng.keyword}`) && (targetLog.includes("BULLISH") || targetLog.includes("CONFIRMED"));
            let isBear = targetLog.includes(`${eng.keyword}`) && (targetLog.includes("BEARISH") || targetLog.includes("CONFIRMED"));
            return {
                id: eng.id,
                name: eng.name,
                type: isBull ? "BUY" : (isBear ? "SELL" : "NONE"),
                voteLabel: isBull ? "YES (BUY)" : (isBear ? "YES (SELL)" : "NO VOTE"),
                detail: eng.desc
            };
        });
    }

    gridDiv.innerHTML = subVotes.map(eng => {
        const isBuy = eng.type === "BUY" || eng.voteLabel?.includes("BUY") || eng.type === "CONFIRMED";
        const isSell = eng.type === "SELL" || eng.voteLabel?.includes("SELL");

        let statusText = eng.voteLabel || "NO VOTE";
        let statusBadgeClass = "badge-info";
        let cardBorder = "rgba(255,255,255,0.1)";
        let cardBg = "rgba(15, 23, 42, 0.75)";
        let titleColor = "#94a3b8";

        if (isBuy) {
            statusText = "🟢 YES (BUY)";
            statusBadgeClass = "badge-win";
            cardBorder = "rgba(16, 185, 129, 0.6)";
            cardBg = "rgba(16, 185, 129, 0.12)";
            titleColor = "#ffffff";
        } else if (isSell) {
            statusText = "🔴 YES (SELL)";
            statusBadgeClass = "badge-loss";
            cardBorder = "rgba(239, 68, 68, 0.6)";
            cardBg = "rgba(239, 68, 68, 0.12)";
            titleColor = "#ffffff";
        } else {
            statusText = "⚪ NO VOTE";
            statusBadgeClass = "badge-info";
            cardBorder = "rgba(255,255,255,0.08)";
            cardBg = "rgba(15, 23, 42, 0.6)";
            titleColor = "#94a3b8";
        }

        return `
            <div style="background: ${cardBg}; border: 1px solid ${cardBorder}; padding: 0.85rem 1rem; border-radius: 8px; transition: all 0.2s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                    <strong style="font-size: 0.85rem; color: ${titleColor};">Engine ${eng.id} [${eng.name}]</strong>
                    <span class="badge ${statusBadgeClass}" style="font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.5rem;">${statusText}</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.3;">${eng.detail || ''}</div>
            </div>
        `;
    }).join('');
}

// 3. Load & Render Performance Reports & Trade Journal
async function loadReportsData() {
    try {
        const sumRes = await fetch('/api/reports/summary');
        const sumData = await sumRes.json();

        if (sumData.status === 'success') {
            const ov = sumData.overall;
            const pnlColor = ov.totalPnL >= 0 ? 'var(--success)' : 'var(--danger)';
            
            document.getElementById('report-total-pnl').innerText = `${ov.totalPnL >= 0 ? '+' : ''}₹${ov.totalPnL.toLocaleString()}`;
            document.getElementById('report-total-pnl').style.color = pnlColor;
            document.getElementById('report-virtual-balance').innerText = `Paper Balance: ₹${(ov.paperBalance || 10000).toLocaleString()}`;
            document.getElementById('report-winrate').innerText = `${ov.winRatePct}%`;
            document.getElementById('report-wins-losses').innerText = `${ov.totalWins} Wins / ${ov.totalLosses} Losses`;
            document.getElementById('report-total-trades').innerText = ov.totalTrades;
            document.getElementById('report-pf').innerText = ov.profitFactor;

            // Render Monthly Table
            const mBody = document.getElementById('report-monthly-tbody');
            if (mBody) {
                if (sumData.monthlySummary && sumData.monthlySummary.length > 0) {
                    mBody.innerHTML = sumData.monthlySummary.map(m => {
                        const mPnlColor = m.pnl >= 0 ? 'var(--success)' : 'var(--danger)';
                        return `
                            <tr>
                                <td style="font-weight: 700; color: #fff;">🗓️ ${m.month}</td>
                                <td>${m.trades}</td>
                                <td><span class="badge badge-win">${m.winRatePct}%</span></td>
                                <td>${m.wins} W / ${m.losses} L</td>
                                <td style="color: ${mPnlColor}; font-weight: 800;">${m.pnl >= 0 ? '+' : ''}₹${m.pnl.toLocaleString()}</td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    mBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 2rem;">No monthly trade data recorded yet.</td></tr>`;
                }
            }

            // Render Daily Table
            const dBody = document.getElementById('report-daily-tbody');
            if (dBody) {
                if (sumData.dailySummary && sumData.dailySummary.length > 0) {
                    dBody.innerHTML = sumData.dailySummary.map(d => {
                        const dPnlColor = d.pnl >= 0 ? 'var(--success)' : 'var(--danger)';
                        return `
                            <tr>
                                <td style="font-weight: 700; color: #fff;">📅 ${d.date}</td>
                                <td>${d.trades}</td>
                                <td><span class="badge badge-win">${d.winRatePct}%</span></td>
                                <td>${d.wins} W / ${d.losses} L</td>
                                <td style="color: ${dPnlColor}; font-weight: 800;">${d.pnl >= 0 ? '+' : ''}₹${d.pnl.toLocaleString()}</td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    dBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 2rem;">No daily trade data recorded yet.</td></tr>`;
                }
            }
        }

        // Fetch Full Trade Journal
        let url = '/api/reports/journal';
        if (currentJournalFilterMode) url += `?mode=${currentJournalFilterMode}`;

        const jRes = await fetch(url);
        const jData = await jRes.json();

        const jBody = document.getElementById('report-journal-tbody');
        if (jBody) {
            if (jData.status === 'success' && jData.journal && jData.journal.length > 0) {
                jBody.innerHTML = jData.journal.map(t => {
                    const itemPnlColor = t.pnl >= 0 ? 'var(--success)' : 'var(--danger)';
                    const modeBadge = t.mode === 'REAL' ? '<span class="mode-selector-badge real">⚡ REAL</span>' : '<span class="mode-selector-badge paper">📄 PAPER</span>';
                    const resultBadge = t.result.includes('WIN') ? 'badge-win' : 'badge-loss';
                    return `
                        <tr>
                            <td style="font-family: var(--font-mono); font-size: 0.8rem;">#${t.orderId}</td>
                            <td>${modeBadge}</td>
                            <td>${t.date} ${t.entryTime}</td>
                            <td style="font-weight: 700; color: #fff;">${t.optionSymbol} (${t.numLots} Lot / ${t.quantity} Qty)</td>
                            <td>${t.quantity}</td>
                            <td>₹${t.entryPremium}</td>
                            <td style="font-weight: 700;">₹${t.exitPremium}</td>
                            <td>SL: ₹${t.finalSL || t.initialSL} / T1: ₹${t.target1}</td>
                            <td style="color: ${itemPnlColor}; font-weight: 800;">${t.pnl >= 0 ? '+' : ''}₹${t.pnl.toLocaleString()} (${t.pointsPnL >= 0 ? '+' : ''}${t.pointsPnL} pts)</td>
                            <td><span class="badge ${resultBadge}">${t.exitReason}</span></td>
                        </tr>
                    `;
                }).join('');
            } else {
                jBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: var(--text-muted); padding: 2rem;">No trades recorded in journal for selected filter.</td></tr>`;
            }
        }
    } catch (e) {
        console.warn('Failed to load reports:', e.message);
    }
}

function filterJournalView(mode) {
    currentJournalFilterMode = mode;
    loadReportsData();
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
        cardSubtext.innerText = 'Automatic Order Placement Active';
    } else {
        statusText.innerText = 'ORDER SWITCH: OFF';
        statusText.style.color = 'var(--danger)';
        cardText.innerText = '🔴 OFF';
        cardText.style.color = 'var(--danger)';
        cardSubtext.innerText = 'Signal Alert Mode Only (No Broker Order)';
    }
}

// Interactive UI Backtest Execution Handler
async function runUIBacktest() {
    let startEl = document.getElementById('bt-start-date');
    let endEl = document.getElementById('bt-end-date');

    let startDate = startEl?.value || '2026-09-01';
    let endDate = endEl?.value || '2026-09-18';

    // Auto-correct corrupt date inputs (e.g. 0001-08-31 -> 2026-08-31)
    if (startDate.startsWith('0001') || (startDate.split('-')[0] && parseInt(startDate.split('-')[0], 10) < 2000)) {
        startDate = '2026' + startDate.substring(4);
        if (startEl) startEl.value = startDate;
    }
    if (endDate.startsWith('0001') || (endDate.split('-')[0] && parseInt(endDate.split('-')[0], 10) < 2000)) {
        endDate = '2026' + endDate.substring(4);
        if (endEl) endEl.value = endDate;
    }

    const initialCapital = Number(document.getElementById('bt-initial-capital')?.value || 100000);

    const btn = document.getElementById('run-backtest-btn');
    const badge = document.getElementById('bt-status-badge');
    const tbody = document.getElementById('bt-trades-tbody');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `⏳ RUNNING...`;
    }
    if (badge) {
        badge.className = 'badge badge-warning';
        badge.innerText = '⏳ Downloading Candles & Processing...';
    }
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">⏳ Processing Dhan 5-min candles for ${startDate} to ${endDate}... Please wait...</td></tr>`;
    }

    try {
        const res = await fetch('/api/backtest/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate, initialCapital })
        });
        const data = await res.json();

        if (data.success && data.report) {
            const r = data.report;

            const initEl = document.getElementById('bt-card-initial');
            if (initEl) initEl.innerText = `₹${r.initialCapital.toLocaleString()}`;

            const finalEl = document.getElementById('bt-card-final');
            if (finalEl) finalEl.innerText = `₹${r.finalCapital.toLocaleString()}`;

            const pnlEl = document.getElementById('bt-card-pnl');
            const isProfit = r.netPnL >= 0;
            if (pnlEl) {
                pnlEl.className = isProfit ? 'card-value green' : 'card-value red';
                pnlEl.innerText = `${isProfit ? '+' : ''}₹${r.netPnL.toLocaleString()} (${isProfit ? '+' : ''}${r.netPnLPct}%)`;
            }

            const winrateEl = document.getElementById('bt-card-winrate');
            if (winrateEl) {
                winrateEl.className = r.winRate >= 50 ? 'card-value green' : 'card-value red';
                winrateEl.innerText = `${r.winRate}%`;
            }

            const wlEl = document.getElementById('bt-card-wins-losses');
            if (wlEl) wlEl.innerText = `${r.wins} Wins / ${r.losses} Losses (${r.totalTrades} Trades)`;

            if (badge) {
                badge.className = 'badge badge-success';
                badge.innerText = `✅ Completed (${r.totalTrades} Trades)`;
            }

            if (!r.trades || r.trades.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">⚪ No trades triggered during ${startDate} to ${endDate}. 100% Capital Safe (₹${r.initialCapital.toLocaleString()}).</td></tr>`;
            } else {
                tbody.innerHTML = r.trades.map((t, idx) => {
                    const isWin = t.pnlRupees > 0;
                    const isLoss = t.pnlRupees < 0;
                    const badgeClass = isWin ? 'badge-win' : (isLoss ? 'badge-loss' : 'badge-info');
                    const pnlColor = isWin ? '#10b981' : (isLoss ? '#ef4444' : '#94a3b8');
                    const lotsInfo = `<div style="font-size: 0.72rem; color: #a7f3d0; margin-top: 2px;">${t.numLots || 1} Lot (${t.quantity || 65} Qty)</div>`;

                    return `
                        <tr>
                            <td>#${idx + 1}</td>
                            <td>${t.date} ${t.entryTime}</td>
                            <td>${t.exitTime}</td>
                            <td><span class="badge ${t.optionType === 'CE' ? 'badge-win' : 'badge-loss'}">NIFTY ${t.optionType}</span>${lotsInfo}</td>
                            <td style="font-weight: 700; color: #fff;">₹${t.spotEntryPrice}</td>
                            <td style="font-size: 0.8rem;">SL: ₹${t.spotSL}<br>Target: ₹${t.spotTarget}</td>
                            <td style="font-weight: 600;">Entry: ₹${t.optionPremiumPrice}<br>Exit: ₹${t.exitPremiumPrice}</td>
                            <td><span class="badge ${badgeClass}">${t.exitReason}</span></td>
                            <td style="font-weight: 800; color: ${pnlColor};">${t.pnlRupees >= 0 ? '+' : ''}₹${t.pnlRupees.toLocaleString()} (${t.pnlPoints >= 0 ? '+' : ''}${t.pnlPoints} pts)</td>
                            <td style="font-weight: 800; color: #38bdf8;">₹${t.balanceAfter.toLocaleString()}</td>
                        </tr>
                    `;
                }).join('');
            }
        } else {
            alert('Backtest error: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Backtest fetch failed: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `⚡ RUN BACKTEST`;
        }
    }
}

// Initial Load
window.onload = () => {
    if (window.location.hash === '#reports') {
        switchTab('reports');
    } else if (window.location.hash === '#backtest') {
        switchTab('backtest');
    } else if (window.location.hash === '#simulator') {
        switchTab('simulator');
    } else {
        switchTab('live');
    }

    fetchLiveStatus();
    setInterval(fetchLiveStatus, 2000);
};

// ==================== TICK-BY-TICK SIMULATOR ENGINE ====================
let simState = {
    targetDate: '2026-09-11',
    initialCapital: 10000,
    runningCapital: 10000,
    activeTrade: null,
    dailyTradeCount: 0,
    dayCandles: [],
    dayIndices: [],
    currentStep: 0,
    autoPlayTimer: null,
    isAutoPlaying: false,
    isStepping: false,
    completedTrades: [],
    logs: []
};

async function initSimulation() {
    const dateInput = document.getElementById('sim-date')?.value || '2026-09-11';
    const capInput = Number(document.getElementById('sim-capital')?.value || 10000);

    const startBtn = document.getElementById('sim-start-btn');
    const nextBtn = document.getElementById('sim-next-btn');
    const autoBtn = document.getElementById('sim-auto-btn');

    if (startBtn) startBtn.disabled = true;

    try {
        const res = await fetch('/api/simulator/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateInput, initialCapital: capInput })
        });
        const data = await res.json();

        if (data.success) {
            simState.targetDate = data.targetDate;
            simState.initialCapital = data.initialCapital;
            simState.runningCapital = data.initialCapital;
            simState.activeTrade = null;
            simState.dailyTradeCount = 0;
            simState.dayCandles = data.dayCandles || [];
            simState.dayIndices = data.dayIndices || [];
            simState.currentStep = 0;
            simState.completedTrades = [];
            simState.logs = [`🎬 SIMULATION INITIALIZED: Date ${simState.targetDate} | Starting Balance: ₹${simState.initialCapital.toLocaleString()} (${simState.dayCandles.length} candles loaded)`];

            if (nextBtn) nextBtn.disabled = false;
            if (autoBtn) autoBtn.disabled = false;

            updateSimHeaderUI(null, null, `Initialized (${simState.dayCandles.length} Candles Ready)`);
            renderSimReasoningLog();
            renderSimCompletedTradesTable();
            await nextSimStep();
        } else {
            alert('Simulator Init Error: ' + (data.error || 'Failed to initialize dataset'));
        }
    } catch (e) {
        alert('Simulator Init Fetch Error: ' + e.message);
    } finally {
        if (startBtn) startBtn.disabled = false;
    }
}

async function nextSimStep() {
    if (simState.isStepping) return;
    if (simState.currentStep >= simState.dayCandles.length) {
        if (simState.isAutoPlaying) toggleAutoPlay();
        alert(`🏁 Simulation Complete for ${simState.targetDate}! Final Balance: ₹${simState.runningCapital.toLocaleString()}`);
        return;
    }

    simState.isStepping = true;
    const globalIdx = simState.dayIndices[simState.currentStep];

    try {
        const res = await fetch('/api/simulator/step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetDate: simState.targetDate,
                globalIndex: globalIdx,
                runningCapital: simState.runningCapital,
                activeTrade: simState.activeTrade,
                dailyTradeCount: simState.dailyTradeCount
            })
        });
        const data = await res.json();

        if (data.success) {
            simState.activeTrade = data.updatedActiveTrade;
            simState.runningCapital = data.updatedCapital;
            simState.dailyTradeCount = data.dailyTradeCount;

            if (data.tradeEnteredEvent) {
                simState.logs.unshift(`🚀 [${data.timeStr}] ORDER ENTERED: ${data.tradeEnteredEvent.optionType} @ Spot ₹${data.tradeEnteredEvent.spotEntryPrice} (${data.tradeEnteredEvent.numLots} Lot / ${data.tradeEnteredEvent.quantity} Qty). SL: ₹${data.tradeEnteredEvent.spotSL}, Target: ₹${data.tradeEnteredEvent.spotTarget}`);
            }

            if (data.tradeClosedEvent) {
                const t = data.tradeClosedEvent;
                const sign = t.pnlRupees >= 0 ? '+' : '';
                simState.completedTrades.push(t);
                simState.logs.unshift(`🏁 [${data.timeStr}] ORDER CLOSED: ${t.type} Exit Reason: ${t.exitReason}. PnL: ${sign}₹${t.pnlRupees} (${sign}${t.pnlPoints} pts). Balance: ₹${t.balanceAfter.toLocaleString()}`);
                renderSimCompletedTradesTable();
            }

            const stepLog = `⏱️ [${data.timeStr}] Spot: ₹${data.candle.close} | Consensus: ${data.consensusResult.type === 'NONE' ? 'WAITING' : data.consensusResult.type} (${data.consensusResult.buyVotes || data.consensusResult.consensusVotes || 0}/17 Votes)`;
            simState.logs.unshift(stepLog);

            renderSimStep(data);
            simState.currentStep++;
        }
    } catch (e) {
        console.warn('Sim step error:', e.message);
    } finally {
        simState.isStepping = false;
    }
}

function renderSimStep(data) {
    updateSimHeaderUI(data.candle, data.consensusResult, `Candle ${simState.currentStep + 1} / ${simState.dayCandles.length}`);
    renderEngineVotingGrid(data.consensusResult.voteDetails || []);
    renderSimActiveTradeUI(data.updatedActiveTrade);
    renderSimReasoningLog();
}

function updateSimHeaderUI(candle, consensus, statusText) {
    const clockEl = document.getElementById('sim-clock-display');
    const priceEl = document.getElementById('sim-price-display');
    const votesEl = document.getElementById('sim-votes-display');
    const statusEl = document.getElementById('sim-consensus-status');
    const tradesEl = document.getElementById('sim-trades-count');
    const balEl = document.getElementById('sim-balance-display');
    const pnlEl = document.getElementById('sim-pnl-display');

    if (candle) {
        if (clockEl) clockEl.innerText = candle.time || '--:--';
        if (priceEl) priceEl.innerText = `Nifty Spot: ₹${candle.close}`;
    }

    if (consensus) {
        const votes = consensus.consensusVotes || consensus.buyVotes || consensus.sellVotes || 0;
        if (votesEl) votesEl.innerText = `${votes} / 17 Votes`;
        if (statusEl) {
            if (consensus.type === 'BUY') {
                statusEl.innerText = `🟢 BULLISH CE SIGNAL TRIGGERED (${votes}/17)`;
                statusEl.style.color = '#10b981';
            } else if (consensus.type === 'SELL') {
                statusEl.innerText = `🔴 BEARISH PE SIGNAL TRIGGERED (${votes}/17)`;
                statusEl.style.color = '#ef4444';
            } else {
                statusEl.innerText = `🟡 WAITING CONSENSUS (Required >= 11/17)`;
                statusEl.style.color = '#f59e0b';
            }
        }
    }

    if (tradesEl) tradesEl.innerText = `${simState.dailyTradeCount} / 3 Trades`;
    if (balEl) balEl.innerText = `₹${simState.runningCapital.toLocaleString()}`;

    const diff = Number((simState.runningCapital - simState.initialCapital).toFixed(2));
    if (pnlEl) pnlEl.innerText = `Daily PnL: ${diff >= 0 ? '+' : ''}₹${diff.toLocaleString()}`;
}

function renderEngineVotingGrid(voteDetails) {
    const grid = document.getElementById('sim-engine-voting-grid');
    if (!grid) return;

    const engines = [
        "Engine 1 [ORB Level]",
        "Engine 2 [Volume Surge]",
        "Engine 3 [RSI Momentum]",
        "Engine 4 [EMA Trend]",
        "Engine 5 [PCR Sentiment]",
        "Engine 6 [ATR Volatility]",
        "Engine 7 [Rangebox Squeeze]",
        "Engine 8 [VWAP Benchmark]",
        "Engine 9 [Supertrend]",
        "Engine 10 [Price Action]",
        "Engine 11 [MACD Histogram]",
        "Engine 12 [Bollinger Bands]",
        "Engine 13 [Prev Day Levels]",
        "Engine 14 [OBV Accumulation]",
        "Engine 15 [Body Velocity]",
        "Engine 16 [Bank Nifty Alignment]",
        "Engine 17 [SMC Liquidity Sweep]"
    ];

    grid.innerHTML = engines.map((engName, idx) => {
        const matchingVote = voteDetails.find(v => v.toLowerCase().includes(`engine ${idx + 1}`));
        let isYes = Boolean(matchingVote);
        let voteType = 'NONE';
        if (matchingVote) {
            if (matchingVote.toLowerCase().includes('bullish') || matchingVote.toLowerCase().includes('ce')) voteType = 'BUY';
            else if (matchingVote.toLowerCase().includes('bearish') || matchingVote.toLowerCase().includes('pe')) voteType = 'SELL';
            else voteType = 'YES';
        }

        const bg = voteType === 'BUY' ? 'rgba(16, 185, 129, 0.15)' : (voteType === 'SELL' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.04)');
        const border = voteType === 'BUY' ? '#10b981' : (voteType === 'SELL' ? '#ef4444' : 'rgba(255, 255, 255, 0.1)');
        const textColor = voteType === 'BUY' ? '#6ee7b7' : (voteType === 'SELL' ? '#fca5a5' : '#94a3b8');
        const badge = voteType === 'BUY' ? '🟢 YES (BUY)' : (voteType === 'SELL' ? '🔴 YES (SELL)' : '⚪ NO VOTE');

        return `
            <div style="background: ${bg}; border: 1px solid ${border}; border-radius: 8px; padding: 0.75rem; font-size: 0.8rem;">
                <div style="font-weight: 700; color: #fff; margin-bottom: 0.25rem;">${engName}</div>
                <div style="color: ${textColor}; font-weight: 600;">${badge}</div>
            </div>
        `;
    }).join('');
}

function renderSimActiveTradeUI(pos) {
    const badge = document.getElementById('sim-pos-badge');
    const container = document.getElementById('sim-pos-details');

    if (pos) {
        const currPrem = pos.currentPremium || pos.optionPremiumPrice;
        const ptsPnL = Number((currPrem - pos.optionPremiumPrice).toFixed(2));
        const rupeePnL = Number((ptsPnL * pos.quantity).toFixed(2));
        const isWin = rupeePnL >= 0;
        const pnlColor = isWin ? '#10b981' : '#ef4444';
        const sign = isWin ? '+' : '';

        if (badge) {
            badge.innerText = `⚡ ACTIVE ${pos.optionType} POSITION (${pos.numLots} Lot / ${pos.quantity} Qty)`;
            badge.className = isWin ? 'badge badge-win' : 'badge badge-loss';
        }
        if (container) {
            const isTrailed = pos.currentSL >= pos.optionPremiumPrice;
            container.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; background: rgba(255,255,255,0.03); padding: 0.5rem 0.75rem; border-radius: 6px;">
                    <div>
                        <span style="font-size: 0.8rem; color: #94a3b8;">Contract:</span>
                        <b style="color: #00f2fe; margin-left: 4px; font-size: 0.95rem;">NIFTY ${pos.optionType}</b>
                        <span style="font-size: 0.75rem; color: #a7f3d0; margin-left: 6px;">(${pos.numLots} Lot / ${pos.quantity} Qty)</span>
                    </div>
                    <div>
                        <span style="font-size: 0.8rem; color: #94a3b8;">Live Trade PnL:</span>
                        <b style="color: ${pnlColor}; font-size: 1.1rem; margin-left: 6px;">${sign}₹${rupeePnL.toLocaleString()} (${sign}${ptsPnL} pts)</b>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; font-size: 0.85rem;">
                    <span>Spot Entry: <b style="color:#fff;">₹${pos.spotEntryPrice}</b></span>
                    <span>Entry Premium: <b style="color:#fff;">₹${pos.optionPremiumPrice}</b></span>
                    <span>Live Premium: <b style="color: #f59e0b;">₹${currPrem}</b></span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; font-size: 0.85rem;">
                    <span>Spot SL / Target: <b style="color: #ef4444;">₹${pos.spotSL}</b> / <b style="color: #10b981;">₹${pos.spotTarget}</b></span>
                    <span>Option SL / Target: <b style="color: #ef4444;">₹${pos.currentSL}</b> / <b style="color: #10b981;">₹${pos.target}</b></span>
                </div>
                <div style="margin-top: 0.6rem; text-align: center;">
                    <span class="badge ${isTrailed ? 'badge-win' : 'badge-info'}" style="padding: 0.3rem 0.75rem; font-size: 0.8rem;">
                        ${isTrailed ? '🎯 TRAILING SL AT COST (BREAKEVEN SAFE - NO RISK)' : '⏳ POSITION ACTIVE (SL AT INITIAL LEVEL)'}
                    </span>
                </div>
            `;
        }
    } else {
        if (badge) {
            badge.innerText = 'No Active Trade';
            badge.className = 'badge badge-info';
        }
        if (container) {
            container.innerHTML = `No active intraday option trade open. Scanning candles step-by-step for >= 11/17 consensus votes...`;
        }
    }
}

function renderSimReasoningLog() {
    const consoleDiv = document.getElementById('sim-reasoning-console');
    if (consoleDiv && simState.logs) {
        consoleDiv.innerHTML = simState.logs.map(log => `
            <div style="margin-bottom: 0.4rem; border-bottom: 1px dashed rgba(255,255,255,0.06); padding-bottom: 0.3rem;">
                ${log}
            </div>
        `).join('');
    }
}

function toggleAutoPlay() {
    const btn = document.getElementById('sim-auto-btn');
    if (simState.isAutoPlaying) {
        clearInterval(simState.autoPlayTimer);
        simState.isAutoPlaying = false;
        if (btn) btn.innerText = '⏯️ AUTO PLAY';
    } else {
        simState.isAutoPlaying = true;
        if (btn) btn.innerText = '⏸️ PAUSE PLAY';
        simState.autoPlayTimer = setInterval(nextSimStep, 1000);
    }
}

function resetSimulation() {
    if (simState.isAutoPlaying) toggleAutoPlay();
    simState.currentStep = 0;
    simState.runningCapital = simState.initialCapital;
    simState.activeTrade = null;
    simState.dailyTradeCount = 0;
    simState.logs = ['🔄 SIMULATION RESET TO STARTING STATE'];

    const nextBtn = document.getElementById('sim-next-btn');
    const autoBtn = document.getElementById('sim-auto-btn');
    if (nextBtn) nextBtn.disabled = true;
    if (autoBtn) autoBtn.disabled = true;

    updateSimHeaderUI(null, null, 'Reset Complete');
    renderEngineVotingGrid([]);
    renderSimActiveTradeUI(null);
    simState.completedTrades = [];
    renderSimCompletedTradesTable();
    renderSimReasoningLog();
}

function renderSimCompletedTradesTable() {
    const tbody = document.getElementById('sim-completed-trades-tbody');
    const badge = document.getElementById('sim-completed-count-badge');
    const trades = simState.completedTrades || [];

    if (badge) badge.innerText = `${trades.length} Completed Trades`;

    if (!tbody) return;

    if (trades.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No completed simulation trades yet. As candles advance, closed trades will be logged here in real-time.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = trades.map((t, idx) => {
        const isWin = t.pnlRupees > 0;
        const isLoss = t.pnlRupees < 0;
        const badgeClass = isWin ? 'badge-win' : (isLoss ? 'badge-loss' : 'badge-info');
        const pnlColor = isWin ? '#10b981' : (isLoss ? '#ef4444' : '#94a3b8');
        const pnlSign = t.pnlRupees >= 0 ? '+' : '';
        const lotsInfo = `<div style="font-size: 0.72rem; color: #a7f3d0; margin-top: 2px;">${t.numLots || 1} Lot (${t.qty || t.quantity || 65} Qty)</div>`;

        return `
            <tr>
                <td>#${idx + 1}</td>
                <td>${t.date} ${t.entryTime} → ${t.exitTime}</td>
                <td><span class="badge ${t.type === 'CE' ? 'badge-win' : 'badge-loss'}">NIFTY ${t.type}</span>${lotsInfo}</td>
                <td style="font-weight: 700; color: #fff;">₹${t.spotEntry} → ₹${t.spotExit}</td>
                <td style="font-weight: 600;">Entry: ₹${t.entryPremium}<br>Exit: ₹${t.exitPremium}</td>
                <td><span class="badge ${badgeClass}">${t.exitReason}</span></td>
                <td style="font-weight: 800; color: ${pnlColor};">${pnlSign}₹${t.pnlRupees.toLocaleString()} (${pnlSign}${t.pnlPoints} pts)</td>
                <td style="font-weight: 800; color: #38bdf8;">₹${t.balanceAfter.toLocaleString()}</td>
            </tr>
        `;
    }).join('');
}
