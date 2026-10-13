/**
 * AlgoTrade Pro Live Process Dashboard Client
 * Renders ONLY what main.js / masterSL.js actually expose.
 */

const API_BASE = window.location.origin;

setInterval(updateDashboard, 1000);
setInterval(updateClock, 1000);

document.addEventListener("DOMContentLoaded", () => {
    updateClock();
    updateDashboard();
});

function updateClock() {
    const el = document.getElementById("clock-display");
    if (el) {
        el.innerText = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
    }
}

async function updateDashboard() {
    try {
        const res = await fetch(`${API_BASE}/api/dashboard`).then(r => r.json());
        if (res.status !== "success") return;
        const data = res.data || {};

        renderHealth(data.tokenStatus, data.health, data.cycle);
        renderCycle(data.cycle);
        renderConsensus(data.consensus);
        renderMasterSL(data.masterSL);
    } catch (e) {
        console.warn("API poll notice:", e.message);
    }
}

/* ---------- CYCLE ---------- */
function renderCycle(cycle = {}) {
    const dtEl = document.getElementById("cycle-datetime");
    if (dtEl) {
        dtEl.innerText = `${cycle.date || "--"} ${cycle.time || "--"}`;
    }
    const pill = document.getElementById("eval-status-pill");
    if (pill) {
        const busy = Boolean(cycle.isEvaluating);
        pill.innerText = busy ? "EVALUATING" : "IDLE";
        pill.className = `status-pill ${busy ? 'badge-warning' : 'badge-neutral'}`;
    }
}

/* ---------- SYSTEM HEALTH & TOKEN STATUS ---------- */
function renderHealth(tokenStatus = {}, health = {}, cycle = {}) {
    // Overall health pill
    const pill = document.getElementById("health-overall-pill");
    if (pill) {
        const tokenOk = tokenStatus.state === "SUCCESS";
        const uiOk = Boolean(health.uiServer);
        const tickOk = Boolean(health.liveTick);
        const loopOk = Boolean(health.consensusLoop);
        const allOk = tokenOk && uiOk && tickOk && loopOk;

        if (allOk) {
            pill.innerText = "✅ ALL SYSTEMS OK";
            pill.className = "status-pill badge-success";
        } else if (tokenStatus.state === "FAILED") {
            pill.innerText = "❌ TOKEN FAILED";
            pill.className = "status-pill badge-danger";
        } else if (tokenStatus.state === "GENERATING") {
            pill.innerText = "⏳ GENERATING TOKEN...";
            pill.className = "status-pill badge-warning";
        } else {
            pill.innerText = "⚠️ PARTIAL";
            pill.className = "status-pill badge-warning";
        }
    }

    // Token state
    const stateEl = document.getElementById("health-token-state");
    if (stateEl) {
        const s = tokenStatus.state || "PENDING";
        if (s === "SUCCESS") {
            stateEl.innerText = "✅ GENERATED";
            stateEl.className = "rev-val text-success";
        } else if (s === "FAILED") {
            stateEl.innerText = "❌ FAILED";
            stateEl.className = "rev-val text-danger";
        } else if (s === "GENERATING") {
            stateEl.innerText = "⏳ GENERATING...";
            stateEl.className = "rev-val text-warning";
        } else {
            stateEl.innerText = "⏸️ PENDING";
            stateEl.className = "rev-val text-muted";
        }
    }

    setText("health-token-attempts",
        tokenStatus.attempts != null
            ? `${tokenStatus.attempts}/${tokenStatus.maxAttempts || 10}`
            : "--");

    setText("health-token-time", tokenStatus.successTime || "--");

    const msgEl = document.getElementById("health-token-message");
    if (msgEl) {
        msgEl.innerText = tokenStatus.message || "--";
        if (tokenStatus.state === "SUCCESS") msgEl.className = "rev-val text-success";
        else if (tokenStatus.state === "FAILED") msgEl.className = "rev-val text-danger";
        else if (tokenStatus.state === "GENERATING") msgEl.className = "rev-val text-warning";
        else msgEl.className = "rev-val text-muted";
    }

    // Runtime components
    setStatusField("health-ui-server", health.uiServer);
    setStatusField("health-live-tick", health.liveTick);
    setStatusField("health-consensus-loop", health.consensusLoop);
    setText("health-ui-port", health.uiPort != null ? `:${health.uiPort}` : "--");

    // Last cycle status
    const cycleStatus = cycle.status || {};
    const cycleEl = document.getElementById("health-cycle-status");
    if (cycleEl) {
        const s = cycleStatus.state || "PENDING";
        cycleEl.innerText = cycleStatus.message || "--";
        if (s === "SUCCESS") cycleEl.className = "rev-val text-success";
        else if (s === "ERROR") cycleEl.className = "rev-val text-danger";
        else if (s === "RUNNING") cycleEl.className = "rev-val text-warning";
        else cycleEl.className = "rev-val text-muted";
    }
}

function setStatusField(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (value) {
        el.innerText = "✅ RUNNING";
        el.className = "rev-val text-success";
    } else {
        el.innerText = "❌ STOPPED";
        el.className = "rev-val text-danger";
    }
}

/* ---------- CONSENSUS ---------- */
function renderConsensus(c = {}) {
    const badge = document.getElementById("consensus-signal-badge");
    if (badge) {
        const v = c.consensus || "NO_SIGNAL";
        if (v === "BUY") {
            badge.innerText = "🟢 BUY SIGNAL";
            badge.className = "badge-success badge-xl";
        } else if (v === "SELL") {
            badge.innerText = "🔴 SELL SIGNAL";
            badge.className = "badge-danger badge-xl";
        } else if (v === "WAITING_CONFIRMATION") {
            badge.innerText = "⏳ WAITING CONFIRMATION";
            badge.className = "badge-warning badge-xl";
        } else {
            badge.innerText = "⚪ NO SIGNAL / WAITING";
            badge.className = "badge-neutral badge-xl";
        }
    }

    setText("consensus-value", c.consensus || "--");
    setText("consensus-strategy", c.strategyName || "--");
    setText("consensus-entry", c.entry != null ? `₹${c.entry}` : "--");
    setText("consensus-target", c.tr != null ? `₹${c.tr}` : "--");
    setText("consensus-sl", c.sl != null ? `₹${c.sl}` : "--");
    setText("consensus-confidence", c.confidence || "--");

    const tbody = document.getElementById("consensus-strategies-tbody");
    if (!tbody) return;
    const states = c.strategyStates || [];
    if (states.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Waiting for first cycle...</td></tr>`;
        return;
    }
    tbody.innerHTML = states.map(s => {
        const vote = s.vote || "NEUTRAL";
        const voteClass = vote === "BUY" ? "text-success"
            : vote === "SELL" ? "text-danger"
                : "text-muted";
        return `
            <tr>
                <td><strong>${s.strategyName || s.strategyId || '--'}</strong></td>
                <td class="${voteClass}"><strong>${vote}</strong></td>
                <td class="text-secondary" style="font-size:0.82rem;">${s.reason || '--'}</td>
                <td>${s.confidence || '--'}</td>
                <td>${s.tr != null ? '₹' + s.tr : '--'}</td>
                <td>${s.sl != null ? '₹' + s.sl : '--'}</td>
            </tr>
        `;
    }).join("");
}

/* ---------- MASTER SL ---------- */
function renderMasterSL(msl = {}) {
    const cfg = msl.config || {};
    const stock = cfg.selectedStock || {};

    // Runtime
    setText("msl-processing", String(Boolean(msl.isProcessing)));
    setText("msl-maxtread", msl.maxtread != null ? msl.maxtread : "--");

    const ev = msl.lastEvent || {};
    setText("msl-last-event", ev.time ? `${ev.time} — ${ev.message || ''}` : "--");

    const pill = document.getElementById("mastersl-processing-pill");
    if (pill) {
        const busy = Boolean(msl.isProcessing);
        pill.innerText = busy ? "PROCESSING" : "IDLE";
        pill.className = `status-pill ${busy ? 'badge-warning' : 'badge-neutral'}`;
    }

    // Config (from main_config.json)
    setText("msl-real-trade-enabled", cfg.realTradeEnabled != null ? String(cfg.realTradeEnabled) : "--");
    setText("msl-target-points", cfg.targetPoints != null ? cfg.targetPoints : "--");
    setText("msl-sl-points", cfg.stopLossPoints != null ? cfg.stopLossPoints : "--");
    setText("msl-trailing-jump", cfg.trailingJumpPoints != null ? cfg.trailingJumpPoints : "--");
    setText("msl-max-trades", cfg.maxTradesPerRun != null ? cfg.maxTradesPerRun : "--");
    setText("msl-order-exchange", cfg.orderExchangeSegment || "--");

    setText("msl-symbol", stock.symbol || "--");
    setText("msl-security-id", stock.securityId != null ? String(stock.securityId) : "--");
    setText("msl-exchange-segment", stock.exchangeSegment || "--");
    setText("msl-instrument", stock.instrument || "--");
    setText("msl-interval", stock.interval != null ? `${stock.interval}m` : "--");

    renderActivePosition(msl.activePosition);
}

function renderActivePosition(pos) {
    const card = document.getElementById("active-position-card");
    if (!card) return;

    if (!pos) {
        card.className = "active-trade-card glass-card empty-card";
        card.innerHTML = `
            <div class="empty-state-message">
                <span class="empty-icon">🛡️</span>
                <p>No active position.</p>
                <span class="empty-subtext">Waiting for BUY/SELL signal from consensus engine.</span>
            </div>
        `;
        return;
    }

    card.className = "active-trade-card glass-card";
    card.innerHTML = `
        <div class="trade-details-grid">
            <div class="trade-item-box">
                <div class="item-label">Symbol</div>
                <div class="item-val">${pos.symbol || '--'}</div>
            </div>
            <div class="trade-item-box">
                <div class="item-label">Security ID</div>
                <div class="item-val">${pos.securityId || '--'}</div>
            </div>
            <div class="trade-item-box">
                <div class="item-label">Option Type</div>
                <div class="item-val">${pos.optionType || '--'}</div>
            </div>
            <div class="trade-item-box">
                <div class="item-label">Order ID</div>
                <div class="item-val">${pos.orderId || '--'}</div>
            </div>
            <div class="trade-item-box">
                <div class="item-label">Lots</div>
                <div class="item-val">${pos.lots != null ? pos.lots : '--'}</div>
            </div>
            <div class="trade-item-box">
                <div class="item-label">Quantity</div>
                <div class="item-val">${pos.qty != null ? pos.qty : '--'}</div>
            </div>
            <div class="trade-item-box">
                <div class="item-label">Entry Price</div>
                <div class="item-val">₹${pos.entryPrice != null ? Number(pos.entryPrice).toFixed(2) : '--'}</div>
            </div>
            <div class="trade-item-box">
                <div class="item-label">Target Price</div>
                <div class="item-val text-success">₹${pos.targetPrice != null ? Number(pos.targetPrice).toFixed(2) : '--'}</div>
            </div>
            <div class="trade-item-box">
                <div class="item-label">Stop Loss</div>
                <div class="item-val text-danger">₹${pos.currentSl != null ? Number(pos.currentSl).toFixed(2) : '--'}</div>
            </div>
            <div class="trade-item-box">
                <div class="item-label">Trailing Jump</div>
                <div class="item-val text-info">${pos.trailingJump != null ? pos.trailingJump : '--'} pts</div>
            </div>
            <div class="trade-item-box">
                <div class="item-label">Status</div>
                <div class="item-val">${pos.status || '--'}</div>
            </div>
        </div>
    `;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}