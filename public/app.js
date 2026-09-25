/**
 * AlgoTrade Pro Realtime Dashboard Client JavaScript
 * Location: C:\AlgoTrade\public\app.js
 */

const API_BASE = window.location.origin;

// Auto-refresh interval (1 second)
setInterval(updateDashboard, 1000);
setInterval(updateClock, 1000);

document.addEventListener("DOMContentLoaded", () => {
    updateClock();
    updateDashboard();
    fetchLastBacktestReport();
});

function updateClock() {
    const clockEl = document.getElementById("clock-display");
    if (clockEl) {
        clockEl.innerText = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
    }
}

async function updateDashboard() {
    try {
        const res = await fetch(`${API_BASE}/api/dashboard`).then(r => r.json());

        if (res.status === "success") {
            const data = res.data;

            // 1. Live Market & Consensus Engine
            renderLiveConsensus(data);

            // 2. Paper Trading Dashboard
            if (data.paperStatus) {
                renderPaperDashboard(data.paperStatus, data.config);
            }

            // 3. Real Account Dashboard
            if (data.realStatus) {
                renderRealDashboard(data.realStatus, data.config);
            }
        }
    } catch (e) {
        console.warn("API poll notice:", e.message);
    }
}

function renderLiveConsensus(data) {
    const livePrice = Number(data.livePrice || 0);
    const livePriceEl = document.getElementById("header-live-price");
    if (livePriceEl) {
        livePriceEl.innerText = livePrice > 0 ? `₹${livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "Connecting...";
    }

    const spotEl = document.getElementById("consensus-live-spot");
    if (spotEl) {
        spotEl.innerText = livePrice > 0 ? `₹${livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00";
    }

    const c = data.consensus || {};
    const badge = document.getElementById("consensus-signal-badge");
    const entryEl = document.getElementById("consensus-entry");
    const targetEl = document.getElementById("consensus-target");
    const slEl = document.getElementById("consensus-sl");
    const confEl = document.getElementById("consensus-confidence");
    const waitTimerEl = document.getElementById("consensus-wait-timer");

    if (badge) {
        if (c.consensus === "BUY") {
            badge.innerText = "🟢 BUY SIGNAL CONFIRMED & TRIGGERED";
            badge.className = "badge-success badge-xl";
            if (waitTimerEl) { waitTimerEl.innerText = "--"; waitTimerEl.className = "m-val text-muted"; }
        } else if (c.consensus === "SELL") {
            badge.innerText = "🔴 SELL SIGNAL CONFIRMED & TRIGGERED";
            badge.className = "badge-danger badge-xl";
            if (waitTimerEl) { waitTimerEl.innerText = "--"; waitTimerEl.className = "m-val text-muted"; }
        } else if (c.consensus === "WAITING_CONFIRMATION") {
            const elapsedMins = c.confirmation?.elapsedMins || 0;
            const reqMins = c.confirmation?.requiredWaitMins || 0.5;
            const remMins = c.confirmation?.remainingMins !== undefined ? c.confirmation.remainingMins : (reqMins - elapsedMins);
            const remSecs = Math.max(0, Math.round(remMins * 60));
            const rawDir = c.rawType === "BUY" ? "🟢 BUY" : "🔴 SELL";

            badge.innerText = `⏳ WAITING CONFIRMATION [${rawDir}] (${remSecs}s Remaining)`;
            badge.className = "badge-warning badge-xl";

            if (waitTimerEl) {
                waitTimerEl.innerText = `⏳ ${remSecs}s (${elapsedMins}m / ${reqMins}m)`;
                waitTimerEl.className = "m-val text-warning font-mono";
            }
        } else {
            badge.innerText = "⚪ NO SIGNAL / WAITING";
            badge.className = "badge-neutral badge-xl";
            if (waitTimerEl) { waitTimerEl.innerText = "--"; waitTimerEl.className = "m-val text-muted"; }
        }
    }

    if (entryEl) entryEl.innerText = c.entry ? `₹${c.entry}` : "--";
    if (targetEl) targetEl.innerText = c.tr ? `₹${c.tr}` : "--";
    if (slEl) slEl.innerText = c.sl ? `₹${c.sl}` : "--";
    if (confEl) confEl.innerText = c.confidence || "0%";

    // Render Strategy Voting Breakdown Table
    const tbody = document.getElementById("consensus-strategies-tbody");
    if (tbody) {
        const states = c.strategyStates || [];
        if (states.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Listening for Market Ticks...</td></tr>`;
        } else {
            tbody.innerHTML = states.map(s => {
                const isBuy = s.vote === "BUY";
                const isSell = s.vote === "SELL";

                const statusHtml = isBuy 
                    ? `<span class="badge-success">🟢 YES (BUY)</span>` 
                    : isSell 
                    ? `<span class="badge-danger">🔴 YES (SELL)</span>` 
                    : `<span class="badge-neutral">❌ NO (NEUTRAL)</span>`;

                const voteSignalText = isBuy ? "YES (BUY)" : isSell ? "YES (SELL)" : "NO";
                const voteSignalClass = isBuy ? "text-success" : isSell ? "text-danger" : "text-muted";
                const reasonText = s.reason || "--";

                return `
                    <tr>
                        <td><strong>${s.strategyName || s.strategyId}</strong></td>
                        <td>${statusHtml}</td>
                        <td class="${voteSignalClass}"><strong>${voteSignalText}</strong></td>
                        <td class="text-secondary font-mono" style="font-size: 0.82rem;">${reasonText}</td>
                        <td>${s.confidence || '70%'}</td>
                        <td>${s.tr ? '₹' + s.tr : '--'}</td>
                        <td>${s.sl ? '₹' + s.sl : '--'}</td>
                    </tr>
                `;
            }).join("");
        }
    }
}

function renderPaperDashboard(data, config = {}) {
    const isEnabled = config.paperTradeEnabled !== undefined ? config.paperTradeEnabled : data.enabled;

    // 1. Toggles & Terminal Badges
    const toggle = document.getElementById("paper-toggle");
    if (toggle && document.activeElement !== toggle) {
        toggle.checked = Boolean(isEnabled);
    }

    const termBadge = document.getElementById("paper-terminal-badge");
    if (termBadge) {
        termBadge.innerText = isEnabled ? "ACTIVE" : "DISABLED";
        termBadge.className = `status-pill ${isEnabled ? 'badge-success' : 'badge-neutral'}`;
    }

    const engineState = document.getElementById("paper-engine-state");
    if (engineState) {
        engineState.innerText = isEnabled ? "ACTIVE" : "DISABLED";
        engineState.className = `kpi-value ${isEnabled ? 'text-success' : 'text-muted'}`;
    }

    // 2. Balances & Stats
    document.getElementById("paper-balance").innerText = `₹${Number(data.currentBalance || 100000).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    document.getElementById("paper-initial").innerText = `₹${Number(data.initialBalance || 100000).toLocaleString("en-IN")}`;

    const pnl = Number(data.totalPnl || 0);
    const pnlEl = document.getElementById("paper-total-pnl");
    pnlEl.innerText = `${pnl >= 0 ? '+' : ''}₹${pnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    pnlEl.className = `kpi-value ${pnl > 0 ? 'text-success' : pnl < 0 ? 'text-danger' : ''}`;

    const pnlPct = data.initialBalance > 0 ? ((pnl / data.initialBalance) * 100).toFixed(2) : "0.00";
    const pnlBadge = document.getElementById("paper-pnl-badge");
    pnlBadge.innerText = `${pnlPct >= 0 ? '+' : ''}${pnlPct}%`;
    pnlBadge.className = pnl >= 0 ? "badge-success" : "badge-danger";

    document.getElementById("paper-winrate").innerText = data.winrate || "0.0%";
    document.getElementById("paper-trades-count").innerText = data.totalTrades || 0;
    document.getElementById("paper-wins").innerText = data.winningTrades || 0;
    document.getElementById("paper-losses").innerText = data.losingTrades || 0;

    // 3. Active Position Card
    const posCard = document.getElementById("paper-active-position-card");
    const statusBadge = document.getElementById("paper-position-status-badge");

    if (data.activePosition && data.activePosition.status === "OPEN") {
        const pos = data.activePosition;
        statusBadge.innerText = `ACTIVE (${pos.symbol})`;
        statusBadge.className = "status-pill status-active badge-success";

        const pnlVal = Number(pos.pnl || 0);
        const pnlColor = pnlVal > 0 ? "text-success" : pnlVal < 0 ? "text-danger" : "";

        // Targets Calculation Progress
        const lvls = pos.levels || {};
        const tr1 = lvls.tr1 || (pos.entryLtp + 1);
        const tr4 = lvls.tr4 || pos.targetTr4 || (pos.entryLtp + 4);
        const range = Math.max(0.1, tr4 - pos.entryLtp);
        const progressPct = Math.min(100, Math.max(0, (((pos.currentLtp - pos.entryLtp) / range) * 100))).toFixed(1);

        posCard.className = "active-trade-card glass-card";
        posCard.innerHTML = `
            <div class="trade-details-grid">
                <div class="trade-item-box">
                    <div class="item-label">Contract Symbol</div>
                    <div class="item-val">${pos.symbol}</div>
                </div>
                <div class="trade-item-box">
                    <div class="item-label">Entry Option LTP</div>
                    <div class="item-val">₹${pos.entryLtp}</div>
                </div>
                <div class="trade-item-box">
                    <div class="item-label">Live Option LTP</div>
                    <div class="item-val">₹${pos.currentLtp}</div>
                </div>
                <div class="trade-item-box">
                    <div class="item-label">Unrealized PnL</div>
                    <div class="item-val ${pnlColor}">${pos.pnl >= 0 ? '+' : ''}₹${pos.pnl} (${pos.pnlPercent})</div>
                </div>
                <div class="trade-item-box">
                    <div class="item-label">Trailed Stop Loss</div>
                    <div class="item-val text-danger">₹${pos.currentSl}</div>
                </div>
                <div class="trade-item-box">
                    <div class="item-label">Target TR4 (1:4)</div>
                    <div class="item-val text-success">₹${tr4}</div>
                </div>
            </div>

            <div class="progress-container">
                <div class="progress-header">
                    <span>Target Progress (Stage: ${pos.trailingStage || 'INITIAL'})</span>
                    <span>${progressPct}% to TR4 Target</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
                </div>
                <div class="targets-milestones-row">
                    <span>Entry: ₹${pos.entryLtp}</span>
                    <span>TR1: ₹${lvls.tr1 || '-'}</span>
                    <span>TR2: ₹${lvls.tr2 || '-'}</span>
                    <span>TR3: ₹${lvls.tr3 || '-'}</span>
                    <span>TR4: ₹${tr4}</span>
                </div>
            </div>
        `;
    } else {
        statusBadge.innerText = "NO POSITION";
        statusBadge.className = "status-pill status-closed badge-neutral";
        posCard.className = "active-trade-card glass-card empty-card";
        posCard.innerHTML = `
            <div class="empty-state-message">
                <span class="empty-icon">⏳</span>
                <p>No active paper position currently open.</p>
                <span class="empty-subtext">Listening for Consensus Engine Signals...</span>
            </div>
        `;
    }

    // 4. Trade History Table
    const tbody = document.getElementById("paper-history-tbody");
    const history = data.history || [];

    if (history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No paper trade history recorded yet.</td></tr>`;
    } else {
        tbody.innerHTML = history.map(t => {
            const pnl = Number(t.pnl || t.realizedPnl || 0);
            const pnlClass = pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : "";
            const reasonClass = t.exitReason === "TR4_TARGET_HIT" || t.exitReason === "TARGET_HIT" ? "badge-success" : "badge-danger";

            return `
                <tr>
                    <td>${t.tradeId || '-'}</td>
                    <td>${t.entryDate || '-'} ${t.entryTime || ''}</td>
                    <td><strong>${t.symbol || '-'}</strong></td>
                    <td><span class="badge-neutral">${t.optionType || 'CE'}</span></td>
                    <td>₹${t.entryLtp || '-'}</td>
                    <td>₹${t.exitLtp || t.currentLtp || '-'}</td>
                    <td>${t.qty || 65}</td>
                    <td><span class="${reasonClass}">${t.exitReason || 'CLOSED'}</span></td>
                    <td class="${pnlClass}"><strong>${pnl >= 0 ? '+' : ''}₹${pnl}</strong></td>
                </tr>
            `;
        }).join("");
    }
}

function renderRealDashboard(data, config = {}) {
    const isEnabled = config.realTradeEnabled !== undefined ? config.realTradeEnabled : data.enabled;

    const toggle = document.getElementById("real-toggle");
    if (toggle && document.activeElement !== toggle) {
        toggle.checked = Boolean(isEnabled);
    }

    const termBadge = document.getElementById("real-terminal-badge");
    if (termBadge) {
        termBadge.innerText = isEnabled ? "ACTIVE" : "DISABLED";
        termBadge.className = `status-pill ${isEnabled ? 'badge-danger' : 'badge-neutral'}`;
    }

    // Dhan Real Account Funds
    const funds = data.funds || {};
    const availBal = Number(funds.availabelBalance !== undefined ? funds.availabelBalance : 679.52);
    const fundsEl = document.getElementById("real-available-funds");
    if (fundsEl) {
        fundsEl.innerText = `₹${availBal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    }
    const clientEl = document.getElementById("real-client-id");
    if (clientEl && funds.dhanClientId) {
        clientEl.innerText = funds.dhanClientId;
    }

    const stateEl = document.getElementById("real-engine-state");
    if (stateEl) {
        stateEl.innerText = isEnabled ? "ACTIVE (LIVE CAPITAL)" : "DISABLED";
        stateEl.className = `kpi-value ${isEnabled ? 'text-danger' : 'text-muted'}`;
    }

    const activeSymbol = document.getElementById("real-active-symbol");
    const activePnl = document.getElementById("real-active-pnl");

    if (data.activePosition && data.activePosition.status === "OPEN") {
        activeSymbol.innerText = data.activePosition.symbol;
        activePnl.innerText = `PnL: ₹${data.activePosition.pnl || 0}`;
    } else {
        activeSymbol.innerText = "NONE";
        activePnl.innerText = "PnL: ₹0.00";
    }

    // Active Real Position Card
    const posCard = document.getElementById("real-active-position-card");
    if (posCard) {
        if (data.activePosition && data.activePosition.status === "OPEN") {
            const pos = data.activePosition;
            const pnlVal = Number(pos.pnl || 0);
            const pnlColor = pnlVal > 0 ? "text-success" : pnlVal < 0 ? "text-danger" : "";

            const lvls = pos.levels || {};
            const tr1 = lvls.tr1 || (pos.entryLtp + 1);
            const tr4 = lvls.tr4 || pos.targetTr4 || (pos.entryLtp + 4);
            const range = Math.max(0.1, tr4 - pos.entryLtp);
            const progressPct = Math.min(100, Math.max(0, (((pos.currentLtp - pos.entryLtp) / range) * 100))).toFixed(1);

            posCard.className = "active-trade-card glass-card";
            posCard.innerHTML = `
                <div class="trade-details-grid">
                    <div class="trade-item-box">
                        <div class="item-label">Contract Symbol</div>
                        <div class="item-val">${pos.symbol}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Entry Option LTP</div>
                        <div class="item-val">₹${pos.entryLtp}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Live Option LTP</div>
                        <div class="item-val">₹${pos.currentLtp}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Unrealized PnL</div>
                        <div class="item-val ${pnlColor}">${pos.pnl >= 0 ? '+' : ''}₹${pos.pnl || 0} (${pos.pnlPercent || '0%'})</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Trailed Stop Loss</div>
                        <div class="item-val text-danger">₹${pos.currentSl}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Target TR4 (1:4)</div>
                        <div class="item-val text-success">₹${tr4}</div>
                    </div>
                </div>

                <div class="progress-container">
                    <div class="progress-header">
                        <span>Target Progress (Stage: ${pos.trailingStage || 'INITIAL'})</span>
                        <span>${progressPct}% to TR4 Target</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
                    </div>
                    <div class="targets-milestones-row">
                        <span>Entry: ₹${pos.entryLtp}</span>
                        <span>TR1: ₹${lvls.tr1 || '-'}</span>
                        <span>TR2: ₹${lvls.tr2 || '-'}</span>
                        <span>TR3: ₹${lvls.tr3 || '-'}</span>
                        <span>TR4: ₹${tr4}</span>
                    </div>
                </div>
            `;
        } else {
            posCard.className = "active-trade-card glass-card empty-card";
            const errBanner = data.lastError ? `<p class="text-danger" style="margin-top:5px; font-weight:600;">⚠️ Notice: ${data.lastError}</p>` : '';
            posCard.innerHTML = `
                <div class="empty-state-message">
                    <span class="empty-icon">${data.lastError ? '⚠️' : '🛡️'}</span>
                    <p>${isEnabled ? 'No active real position currently open.' : 'Real Trading is currently disabled.'}</p>
                    ${errBanner}
                    <span class="empty-subtext">${isEnabled ? 'Listening for Consensus Signals...' : 'Toggle Real Trade in top right corner to activate live capital execution.'}</span>
                </div>
            `;
        }
    }
}

async function togglePaperTrade(status) {
    const password = prompt("🔒 Enter Admin Password to toggle Paper Trading:");
    if (!password) {
        updateDashboard();
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/api/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paperTradeEnabled: status, password })
        });
        const result = await response.json();
        if (result.status !== "success") {
            alert(`❌ ${result.message || "Incorrect Password! Access Denied."}`);
        }
        updateDashboard();
    } catch (e) {
        console.error("Failed to toggle paper trade:", e.message);
        updateDashboard();
    }
}

async function toggleRealTrade(status) {
    const password = prompt("🔒 Enter Admin Password to toggle Real Trading:");
    if (!password) {
        updateDashboard();
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/api/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ realTradeEnabled: status, password })
        });
        const result = await response.json();
        if (result.status !== "success") {
            alert(`❌ ${result.message || "Incorrect Password! Access Denied."}`);
        }
        updateDashboard();
    } catch (e) {
        console.error("Failed to toggle real trade:", e.message);
        updateDashboard();
    }
}

async function fetchLastBacktestReport() {
    try {
        const res = await fetch(`${API_BASE}/api/backtest/report`).then(r => r.json());
        if (res.status === "success" && res.data) {
            renderBacktestResults(res.data);
        }
    } catch (e) {}
}

async function runBacktest(event) {
    event.preventDefault();
    const btn = document.getElementById("bt-submit-btn");
    const btnText = document.getElementById("bt-btn-text");

    btn.disabled = true;
    btnText.innerText = "⏳ Evaluating Historical Data...";

    const payload = {
        fromDate: document.getElementById("bt-from-date").value,
        toDate: document.getElementById("bt-to-date").value,
        initialBalance: Number(document.getElementById("bt-balance").value),
        lots: Number(document.getElementById("bt-lots").value),
        interval: document.getElementById("bt-interval").value
    };

    try {
        const res = await fetch(`${API_BASE}/api/backtest/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.status === "success") {
            renderBacktestResults(res.data);
        } else {
            alert(`Backtest error: ${res.message}`);
        }
    } catch (e) {
        alert(`Failed to run backtest: ${e.message}`);
    } finally {
        btn.disabled = false;
        btnText.innerText = "🚀 Run Backtest Engine";
    }
}

function renderBacktestResults(data) {
    const container = document.getElementById("backtest-results-container");
    container.classList.remove("display-none");

    document.getElementById("bt-res-final").innerText = `₹${Number(data.finalBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    document.getElementById("bt-res-initial").innerText = `₹${Number(data.initialBalance).toLocaleString("en-IN")}`;

    const netPnl = Number(data.netPnl);
    const pnlEl = document.getElementById("bt-res-netpnl");
    pnlEl.innerText = `${netPnl >= 0 ? '+' : ''}₹${netPnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    pnlEl.className = `kpi-value ${netPnl > 0 ? 'text-success' : netPnl < 0 ? 'text-danger' : ''}`;

    const pnlBadge = document.getElementById("bt-res-pnl-badge");
    pnlBadge.innerText = data.netPnlPercent;
    pnlBadge.className = netPnl >= 0 ? "badge-success" : "badge-danger";

    document.getElementById("bt-res-winrate").innerText = data.stats.winrate;
    document.getElementById("bt-res-trades").innerText = data.stats.totalTrades;
    document.getElementById("bt-res-wins").innerText = data.stats.winningTrades;
    document.getElementById("bt-res-losses").innerText = data.stats.losingTrades;

    document.getElementById("bt-res-drawdown").innerText = `₹${Number(data.stats.maxDrawdown).toLocaleString("en-IN")}`;
    document.getElementById("bt-res-dd-percent").innerText = data.stats.maxDrawdownPercent;

    // Render Monthly PnL Breakdown Table
    const monthlyTbody = document.getElementById("bt-monthly-tbody");
    const monthlyList = data.monthlyBreakdown || [];

    if (monthlyList.length === 0) {
        monthlyTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No monthly breakdown data.</td></tr>`;
    } else {
        monthlyTbody.innerHTML = monthlyList.map(m => {
            const pnl = Number(m.monthlyPnl || 0);
            const pnlClass = pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : "";
            return `
                <tr>
                    <td><strong>${m.monthLabel || m.monthKey}</strong></td>
                    <td>${m.totalTrades}</td>
                    <td><span class="text-success">${m.winningTrades}</span></td>
                    <td><span class="text-danger">${m.losingTrades}</span></td>
                    <td>${m.winrate}</td>
                    <td class="${pnlClass}"><strong>${pnl >= 0 ? '+' : ''}₹${pnl.toLocaleString("en-IN")}</strong></td>
                    <td class="${pnlClass}">${m.monthlyPnlPercent}</td>
                </tr>
            `;
        }).join("");
    }

    // Render Trades Table
    const tbody = document.getElementById("bt-history-tbody");
    const trades = data.trades || [];

    if (trades.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted">No trades triggered during backtest period.</td></tr>`;
    } else {
        tbody.innerHTML = trades.map((t, index) => {
            const pnl = Number(t.realizedPnl || 0);
            const pnlClass = pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : "";
            const reasonClass = t.exitReason === "TARGET_HIT" ? "badge-success" : "badge-danger";

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${t.entryDate} ${t.entryTime}</td>
                    <td><strong>${t.symbol}</strong></td>
                    <td><span class="badge-neutral">${t.optionType}</span></td>
                    <td>₹${t.entrySpot}</td>
                    <td>₹${t.entryLtp}</td>
                    <td>${t.exitDate} ${t.exitTime}</td>
                    <td>₹${t.exitLtp}</td>
                    <td><span class="${reasonClass}">${t.exitReason}</span></td>
                    <td class="${pnlClass}"><strong>${pnl >= 0 ? '+' : ''}₹${pnl}</strong></td>
                    <td>₹${Number(t.balanceAfterTrade).toLocaleString("en-IN")}</td>
                </tr>
            `;
        }).join("");
    }
}

// ==========================================
// RESTART SERVER MODAL & API HANDLERS
// ==========================================
function openRestartModal() {
    const modal = document.getElementById("restart-modal");
    const input = document.getElementById("restart-password-input");
    const err = document.getElementById("modal-error-msg");
    if (err) err.style.display = "none";
    if (input) input.value = "";
    if (modal) modal.style.display = "flex";
    if (input) setTimeout(() => input.focus(), 100);
}

function closeRestartModal() {
    const modal = document.getElementById("restart-modal");
    if (modal) modal.style.display = "none";
}

async function executeServerRestart() {
    const input = document.getElementById("restart-password-input");
    const err = document.getElementById("modal-error-msg");
    const password = input ? input.value.trim() : "";

    if (!password) {
        if (err) {
            err.style.color = "#ef4444";
            err.innerText = "⚠️ Password enter karein!";
            err.style.display = "block";
        }
        return;
    }

    try {
        const response = await fetch("/api/restart-server", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
        });
        const result = await response.json();

        if (response.ok && result.status === "success") {
            if (err) {
                err.style.color = "#10b981";
                err.innerText = "✅ Password Verified! Restarting Server...";
                err.style.display = "block";
            }
            setTimeout(() => {
                closeRestartModal();
                alert("🔄 Server is restarting... Page will reload in 3 seconds.");
                setTimeout(() => location.reload(), 3000);
            }, 1000);
        } else {
            if (err) {
                err.style.color = "#ef4444";
                err.innerText = `❌ ${result.message || "Incorrect Password!"}`;
                err.style.display = "block";
            }
        }
    } catch (e) {
        if (err) {
            err.style.color = "#ef4444";
            err.innerText = `❌ Error restarting server: ${e.message}`;
            err.style.display = "block";
        }
    }
}

// ==========================================
// CLEAN PAPER TRADE MODAL & API HANDLERS
// ==========================================
function openCleanPaperModal() {
    const modal = document.getElementById("clean-paper-modal");
    const input = document.getElementById("clean-paper-password-input");
    const err = document.getElementById("clean-modal-error-msg");
    if (err) err.style.display = "none";
    if (input) input.value = "";
    if (modal) modal.style.display = "flex";
    if (input) setTimeout(() => input.focus(), 100);
}

function closeCleanPaperModal() {
    const modal = document.getElementById("clean-paper-modal");
    if (modal) modal.style.display = "none";
}

async function executeCleanPaperTrade() {
    const input = document.getElementById("clean-paper-password-input");
    const err = document.getElementById("clean-modal-error-msg");
    const password = input ? input.value.trim() : "";

    if (!password) {
        if (err) {
            err.style.color = "#ef4444";
            err.innerText = "⚠️ Password enter karein!";
            err.style.display = "block";
        }
        return;
    }

    try {
        const response = await fetch("/api/clean-paper-trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password, initialBalance: 10000 })
        });
        const result = await response.json();

        if (response.ok && result.status === "success") {
            if (err) {
                err.style.color = "#10b981";
                err.innerText = "✅ Paper Trade cleared successfully!";
                err.style.display = "block";
            }
            setTimeout(() => {
                closeCleanPaperModal();
                fetchDashboardData();
            }, 800);
        } else {
            if (err) {
                err.style.color = "#ef4444";
                err.innerText = `❌ ${result.message || "Incorrect Password!"}`;
                err.style.display = "block";
            }
        }
    } catch (e) {
        if (err) {
            err.style.color = "#ef4444";
            err.innerText = `❌ Error clearing paper trade: ${e.message}`;
            err.style.display = "block";
        }
    }
}
