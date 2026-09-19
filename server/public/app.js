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
    const paperBtn = document.getElementById('mode-paper-btn');
    const realBtn = document.getElementById('mode-real-btn');

    if (mode === 'REAL') {
        if (paperBtn) paperBtn.style.opacity = '0.5';
        if (realBtn) {
            realBtn.style.opacity = '1';
            realBtn.className = 'mode-selector-badge real';
        }
    } else {
        if (realBtn) realBtn.style.opacity = '0.5';
        if (paperBtn) {
            paperBtn.style.opacity = '1';
            paperBtn.className = 'mode-selector-badge paper';
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
    const pnlColor = res.netPnL >= 0 ? 'var(--success)' : 'var(--danger)';
    document.getElementById('kpi-pnl').innerText = `${res.netPnL >= 0 ? '+' : ''}₹${res.netPnL.toLocaleString()}`;
    document.getElementById('kpi-pnl').style.color = pnlColor;
    document.getElementById('kpi-return').innerText = `${res.returnPct >= 0 ? '+' : ''}${res.returnPct}% Return on ₹${res.initialCapital.toLocaleString()}`;
    document.getElementById('kpi-winrate').innerText = `${res.winRatePct}%`;
    document.getElementById('kpi-trades').innerText = `${res.winCount} Wins / ${res.lossCount} Losses (${res.totalTrades} Total Trades)`;
    document.getElementById('kpi-drawdown').innerText = `${res.maxDrawdownPct}%`;
    document.getElementById('kpi-pf').innerText = res.profitFactor;

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

            tr.innerHTML = `
                <td>📅 ${t.date} ${entryTimeStr}</td>
                <td style="font-weight: 700; color: #fff;">${symbStr} (${t.numLots || 1} Lot / ${t.quantity} Qty)</td>
                <td><span class="badge ${isWin ? 'badge-win' : 'badge-loss'}">${t.type} @ ₹${entrySpot}</span></td>
                <td style="font-weight: 700;">₹${entrySpot}</td>
                <td style="color: var(--danger); font-weight: 700;">₹${slSpot}</td>
                <td style="color: var(--success); font-weight: 700;">₹${tgtSpot} <span style="font-size:0.75rem; color:#a7f3d0;">(R:R 1:${t.riskRewardRatio || 3})</span></td>
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
    const toggle = document.getElementById('order-switch-toggle');
    if (toggle) {
        toggle.checked = data.orderSwitchOn;
        updateSwitchUI(data.orderSwitchOn);
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
                                <td style="color: var(--success); font-weight: 700;">₹${sig.optionTarget} <span style="font-size:0.75rem; color:#a7f3d0;">(R:R 1:${sig.riskRewardRatio || 3.0})</span></td>
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
        }
    } catch (e) {}
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

// Initial Load
window.onload = () => {
    if (window.location.hash === '#live') {
        switchTab('live');
    } else if (window.location.hash === '#backtest') {
        switchTab('backtest');
    } else if (window.location.hash === '#reports') {
        switchTab('reports');
    }

    runFullBacktest();
    fetchLiveStatus();
    setInterval(fetchLiveStatus, 2000);
};
