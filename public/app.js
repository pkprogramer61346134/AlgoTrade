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

            // 2. Real Account Dashboard
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

    // Render Evaluated Candle OHLC Details
    const candleData = c.evaluatedCandle || c.candle || c.lastCandle || data.candle;
    if (candleData) {
        const timeEl = document.getElementById("candle-eval-time");
        const openEl = document.getElementById("candle-eval-open");
        const highEl = document.getElementById("candle-eval-high");
        const lowEl = document.getElementById("candle-eval-low");
        const closeEl = document.getElementById("candle-eval-close");
        const volEl = document.getElementById("candle-eval-vol");
        const warmupEl = document.getElementById("candle-eval-warmup");

        const cDate = candleData.date || "";
        const cTime = candleData.time || "";
        const cOpen = Number(candleData.open || candleData.candleOpen || candleData.close || 0);
        const cHigh = Number(candleData.high || candleData.candleHigh || cOpen);
        const cLow = Number(candleData.low || candleData.candleLow || cOpen);
        const cClose = Number(candleData.close || candleData.candleClose || cOpen);
        const cVol = Number(candleData.volume || candleData.candleVolume || 0);

        if (timeEl) timeEl.innerText = `${cDate} ${cTime}`.trim() || "Latest Closed Candle";
        if (openEl) openEl.innerText = `₹${cOpen.toFixed(2)}`;
        if (highEl) highEl.innerText = `₹${cHigh.toFixed(2)}`;
        if (lowEl) lowEl.innerText = `₹${cLow.toFixed(2)}`;
        if (closeEl) closeEl.innerText = `₹${cClose.toFixed(2)}`;
        if (volEl) volEl.innerText = cVol > 0 ? cVol.toLocaleString("en-IN") : "--";
        if (warmupEl) warmupEl.innerText = c.warmupCandleCount ? `${c.warmupCandleCount} Candles` : "200 Candles";
    }

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
    const availBal = Number(
        funds.availabelBalance !== undefined ? funds.availabelBalance :
        funds.availMargin !== undefined ? funds.availMargin :
        funds.availBalance !== undefined ? funds.availBalance :
        funds.availableBalance !== undefined ? funds.availableBalance :
        funds.sodLimit !== undefined ? funds.sodLimit :
        funds.withdrawLimit !== undefined ? funds.withdrawLimit :
        funds.withdrawableBalance !== undefined ? funds.withdrawableBalance : 0
    );
    const fundsEl = document.getElementById("real-available-funds");
    if (fundsEl) {
        fundsEl.innerText = `₹${availBal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    }
    const clientEl = document.getElementById("real-client-id");
    if (clientEl) {
        const cid = funds.dhanClientId || "1101323815";
        clientEl.innerText = cid;
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
    } else if (data.virtualWatch) {
        activeSymbol.innerText = `⚡ ${data.virtualWatch.symbol || 'VIRTUAL_WATCH'}`;
        activePnl.innerText = `Virtual SL: ₹${data.virtualWatch.virtualSl ? Number(data.virtualWatch.virtualSl).toFixed(2) : '--'}`;
    } else {
        activeSymbol.innerText = "NONE";
        activePnl.innerText = "PnL: ₹0.00";
    }

    // Active Real Position Card
    const posCard = document.getElementById("real-active-position-card");
    if (posCard) {
        if (data.activePosition && data.activePosition.status === "OPEN") {
            const pos = data.activePosition;
            const pnlVal = Number(pos.pnl || pos.realizedPnl || 0);
            const pnlColor = pnlVal > 0 ? "text-success" : pnlVal < 0 ? "text-danger" : "";

            const entryLtpVal = Number(pos.entryPrice || pos.entryLtp || 0);
            const currentLtpVal = Number(pos.liveLtp || pos.currentLtp || entryLtpVal);
            const displayEntry = entryLtpVal > 0 ? entryLtpVal.toFixed(2) : '--';
            const displayCurrent = currentLtpVal > 0 ? currentLtpVal.toFixed(2) : '--';

            const lvls = pos.levels || {};
            const tr1 = lvls.tr1 ? Number(lvls.tr1).toFixed(2) : '--';
            const tr2 = lvls.tr2 ? Number(lvls.tr2).toFixed(2) : '--';
            const tr3 = lvls.tr3 ? Number(lvls.tr3).toFixed(2) : '--';
            const tr4 = lvls.tr4 ? Number(lvls.tr4).toFixed(2) : (pos.targetPrice ? Number(pos.targetPrice).toFixed(2) : '--');

            let progressPct = "0.0";
            if (entryLtpVal > 0 && tr4 !== '--' && Number(tr4) > entryLtpVal) {
                const range = Math.max(0.1, Number(tr4) - entryLtpVal);
                const rawPct = (((currentLtpVal - entryLtpVal) / range) * 100);
                progressPct = Math.min(100, Math.max(0, rawPct)).toFixed(1);
                if (isNaN(progressPct)) progressPct = "0.0";
            }

            posCard.className = "active-trade-card glass-card";
            posCard.innerHTML = `
                <div class="trade-details-grid">
                    <div class="trade-item-box">
                        <div class="item-label">Contract Symbol</div>
                        <div class="item-val">${pos.symbol || 'NIFTY_OPTION'}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Entry Option LTP</div>
                        <div class="item-val">₹${displayEntry}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Live Option LTP</div>
                        <div class="item-val">₹${displayCurrent}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Unrealized PnL</div>
                        <div class="item-val ${pnlColor}">${pnlVal >= 0 ? '+' : ''}₹${pnlVal.toFixed(2)} (${pos.pnlPercent || '0%'})</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Trailed Stop Loss</div>
                        <div class="item-val text-danger">₹${pos.currentSl ? Number(pos.currentSl).toFixed(2) : '--'}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Target TR4</div>
                        <div class="item-val text-success">₹${tr4}</div>
                    </div>
                </div>

                <div class="progress-container">
                    <div class="progress-header">
                        <span>Target Progress (Stage: ${pos.trailingStage || 'INITIAL'})</span>
                        <span>${progressPct}% to Target</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
                    </div>
                    <div class="targets-milestones-row">
                        <span>Entry: ₹${displayEntry}</span>
                        <span>TR1: ₹${tr1}</span>
                        <span>TR2: ₹${tr2}</span>
                        <span>TR3: ₹${tr3}</span>
                        <span>TR4: ₹${tr4}</span>
                    </div>
                </div>
            `;
        } else if (data.virtualWatch) {
            const vw = data.virtualWatch;
            const entryVal = Number(vw.virtualEntry || 0);
            const slVal = Number(vw.virtualSl || 0);
            const targetVal = Number(vw.virtualTr || 0);
            const liveLtpVal = Number(vw.liveLtp || data.latestOptionTick?.liveLtp || entryVal);

            const displayEntry = entryVal > 0 ? entryVal.toFixed(2) : '--';
            const displaySl = slVal > 0 ? slVal.toFixed(2) : '--';
            const displayTarget = targetVal > 0 ? targetVal.toFixed(2) : '--';
            const displayLive = liveLtpVal > 0 ? liveLtpVal.toFixed(2) : displayEntry;

            // Calculate Progress Percentage between SL and Target
            let progressPct = "0.0";
            if (targetVal > slVal && liveLtpVal > 0) {
                const range = Math.max(0.1, targetVal - slVal);
                const rawPct = (((liveLtpVal - slVal) / range) * 100);
                progressPct = Math.min(100, Math.max(0, rawPct)).toFixed(1);
            }

            const statusText = vw.slHit 
                ? `⚡ STOP HUNT SWEEP DETECTED | WAITING RECOVERY TO ENTRY (₹${displayEntry})`
                : `🎯 WATCHING VIRTUAL SL (₹${displaySl}) & TARGET (₹${displayTarget})`;

            posCard.className = "active-trade-card glass-card virtual-watch-card";
            posCard.innerHTML = `
                <div style="background: rgba(255,193,7,0.15); border: 1px solid rgba(255,193,7,0.4); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;">
                    <div style="font-weight: 700; color: #ffc107; display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                        <span>⚡ VIRTUAL WATCH ACTIVE (Liquidity Sweep Filter)</span>
                        <span class="badge badge-warning" style="background:#ffc107; color:#000; padding:4px 8px; border-radius:4px; font-weight:700;">${statusText}</span>
                    </div>
                </div>
                
                <div class="trade-details-grid">
                    <div class="trade-item-box">
                        <div class="item-label">Contract Symbol</div>
                        <div class="item-val">${vw.symbol || 'NIFTY_OPTION'}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Virtual Entry LTP</div>
                        <div class="item-val">₹${displayEntry}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Option Live LTP</div>
                        <div class="item-val highlight" style="color:#00e5ff; font-weight:bold;">₹${displayLive}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Virtual SL (Fixed ₹300 Loss)</div>
                        <div class="item-val text-danger" style="font-weight:bold;">₹${displaySl}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Virtual Target (Fixed ₹1000 Profit)</div>
                        <div class="item-val text-success" style="font-weight:bold;">₹${displayTarget}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Sweep & Recovery Status</div>
                        <div class="item-val ${vw.slHit ? 'text-warning' : 'text-info'}" style="font-weight:bold;">
                            ${vw.slHit ? '⚡ SL HIT (Waiting Bounce to Entry)' : '🎯 Watching for SL Hit'}
                        </div>
                    </div>
                </div>

                <div class="progress-container" style="margin-top: 14px;">
                    <div class="progress-header">
                        <span>Liquidity Sweep Range (Live LTP: ₹${displayLive})</span>
                        <span style="color:#ffc107; font-weight:700;">${progressPct}% to Target</span>
                    </div>
                    <div class="progress-bar-bg" style="background: rgba(255,255,255,0.1); height: 10px; border-radius: 5px; overflow: hidden; margin: 6px 0;">
                        <div class="progress-bar-fill" style="width: ${progressPct}%; background: linear-gradient(90deg, #ff4d4d 0%, #ffc107 50%, #00e676 100%); height: 100%; border-radius: 5px; transition: width 0.4s ease;"></div>
                    </div>
                    <div class="targets-milestones-row" style="display: flex; justify-content: space-between; font-size: 11px; opacity: 0.9; margin-top: 4px;">
                        <span style="color:#ff4d4d; font-weight:600;">🔴 Virtual SL: ₹${displaySl}</span>
                        <span style="color:#ffffff; font-weight:600;">📌 Virtual Entry: ₹${displayEntry}</span>
                        <span style="color:#00e5ff; font-weight:700;">⚡ Live: ₹${displayLive}</span>
                        <span style="color:#00e676; font-weight:600;">🟢 Target: ₹${displayTarget}</span>
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

