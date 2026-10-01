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

    // Render 15-Min SL Exit Cooldown Banner
    const mSL = data.masterSLStatus || {};
    const cooldownContainer = document.getElementById("sl-cooldown-banner-container");
    if (cooldownContainer) {
        if (mSL.isSlCooldownActive) {
            const remMins = mSL.remainingCooldownMins || 0;
            const remSecs = mSL.remainingCooldownSecs || 0;
            cooldownContainer.innerHTML = `
                <div class="cooldown-banner active">
                    <span>⏳ 15-MIN SL EXIT COOLDOWN ACTIVE</span>
                    <span>${remMins}m ${remSecs}s Remaining (New entry signals blocked after SL hit)</span>
                </div>
            `;
        } else {
            cooldownContainer.innerHTML = `
                <div class="cooldown-banner ready">
                    <span>✅ SYSTEM READY FOR SIGNALS</span>
                    <span>MasterSL Engine ready (No active SL cooldown)</span>
                </div>
            `;
        }
    }

    // Render Reversal Engine Telemetry Card
    const revContainer = document.getElementById("reversal-telemetry-container");
    if (revContainer) {
        const rStat = data.reversalStatus || {};
        const watch = rStat.activeWatch;
        const recent = (rStat.recentWatches || []).slice(-1)[0];

        const liveNiftyVal = Number(data.livePrice || watch?.livePrice || data.consensus?.lastCandle?.close || data.candle?.close || 0);
        const liveNifty = liveNiftyVal > 0 ? `₹${liveNiftyVal.toFixed(2)}` : 'Connecting Live Feed...';

        if (watch && watch.status === "ACTIVE_WATCH") {
            const isStage1 = watch.stage === 'STAGE_1_WATCH_REVERSAL';
            const entry = Number(watch.entryPrice || 0);
            const liveP = liveNiftyVal || entry;
            
            // Calculate "Kitna Chahiye Target" & "Kitna Bacha Points"
            let targetRequiredText = '';
            let remainingPtsText = '';

            if (watch.type === 'BUY') {
                if (isStage1) {
                    targetRequiredText = `Sweep Dip Below ₹${entry.toFixed(2)}`;
                    if (liveP >= entry) {
                        const ptsNeeded = (liveP - entry).toFixed(2);
                        remainingPtsText = `⏳ ${ptsNeeded} Pts DOWN needed for Sweep`;
                    } else {
                        remainingPtsText = `🎯 Dip Achieved! Low: ₹${(watch.sweepPrice || liveP).toFixed(2)}`;
                    }
                } else {
                    targetRequiredText = `Retest Close >= ₹${entry.toFixed(2)}`;
                    if (liveP < entry) {
                        const ptsNeeded = (entry - liveP).toFixed(2);
                        remainingPtsText = `🎯 ${ptsNeeded} Pts UP needed for Retest Close`;
                    } else {
                        remainingPtsText = `✅ Retest Level Met! (Close >= ₹${entry.toFixed(2)})`;
                    }
                }
            } else if (watch.type === 'SELL') {
                if (isStage1) {
                    targetRequiredText = `Sweep Rally Above ₹${entry.toFixed(2)}`;
                    if (liveP <= entry) {
                        const ptsNeeded = (entry - liveP).toFixed(2);
                        remainingPtsText = `⏳ ${ptsNeeded} Pts UP needed for Sweep`;
                    } else {
                        remainingPtsText = `🎯 Rally Achieved! High: ₹${(watch.sweepPrice || liveP).toFixed(2)}`;
                    }
                } else {
                    targetRequiredText = `Retest Close <= ₹${entry.toFixed(2)}`;
                    if (liveP > entry) {
                        const ptsNeeded = (liveP - entry).toFixed(2);
                        remainingPtsText = `🎯 ${ptsNeeded} Pts DOWN needed for Retest Close`;
                    } else {
                        remainingPtsText = `✅ Retest Level Met! (Close <= ₹${entry.toFixed(2)})`;
                    }
                }
            }

            const stageBadge = watch.candlesWatched <= 1 
                ? '⏳ CANDLE 1 SKIPPED (Sweep Check Starts Candle 2+)'
                : isStage1 
                ? (watch.type === 'BUY' ? '⏳ STAGE 1: Watching Dip Below Entry' : '⏳ STAGE 1: Watching Rally Above Entry')
                : '🎯 STAGE 2: Sweep Found! Waiting Retest Close';

            const lastEvent = rStat.lastFilterEvent || (
                watch.candlesWatched <= 1
                    ? `Candle 1 Signal Candle Skipped. Next check on Candle 2.`
                    : isStage1
                    ? (watch.type === 'BUY' ? `Waiting for Price Low < ₹${watch.entryPrice}` : `Waiting for Price High > ₹${watch.entryPrice}`)
                    : `Sweep Detected @ ₹${watch.sweepPrice}. Waiting Close ${watch.type === 'BUY' ? '>=' : '<='} ₹${watch.entryPrice}`
            );

            revContainer.innerHTML = `
                <div class="reversal-card active-watch-border">
                    <div class="reversal-header">
                        <span class="reversal-title">🔒 Reversal Liquidity Sweep Filter (ACTIVE WATCH LOCKED - LIVE TRACKING)</span>
                        <span class="badge-warning">${stageBadge}</span>
                    </div>
                    <div class="reversal-grid">
                        <div class="reversal-item"><span class="rev-label">Active Signal</span><span class="rev-val ${watch.type === 'BUY' ? 'text-success' : 'text-danger'}">${watch.type} @ ₹${watch.entryPrice}</span></div>
                        <div class="reversal-item"><span class="rev-label">Live Nifty Spot</span><span class="rev-val highlight">${liveNifty}</span></div>
                        <div class="reversal-item"><span class="rev-label">Kitna Chahiye Target</span><span class="rev-val text-info">${targetRequiredText}</span></div>
                        <div class="reversal-item"><span class="rev-label">Kitna Bacha Pts</span><span class="rev-val highlight">${remainingPtsText}</span></div>
                        <div class="reversal-item"><span class="rev-label">Sweep Price</span><span class="rev-val text-warning">${watch.sweepPrice ? '₹' + watch.sweepPrice : 'Searching...'}</span></div>
                        <div class="reversal-item"><span class="rev-label">Watch Progress</span><span class="rev-val">${watch.candlesWatched} / ${rStat.maxWatchCandles || 6} Candles (${watch.candlesWatched * 5}m / 30m Max)</span></div>
                        <div class="reversal-item" style="grid-column: 1 / -1;"><span class="rev-label">Last Filter Event</span><span class="rev-val text-muted" style="font-size:0.8rem;">${lastEvent}</span></div>
                    </div>
                </div>
            `;
        } else {
            const lastStatusText = rStat.lastFilterEvent || (recent ? `Last Watch (${recent.type} @ ₹${recent.entryPrice}): ${recent.status}` : 'System Listening for Consensus Signals');
            revContainer.innerHTML = `
                <div class="reversal-card">
                    <div class="reversal-header">
                        <span class="reversal-title">⚡ Reversal Liquidity Sweep Filter (LIVE TICK MONITOR ONLINE)</span>
                        <span class="badge-success">LIVE TICK FEED STREAMING</span>
                    </div>
                    <div class="reversal-grid">
                        <div class="reversal-item"><span class="rev-label">Live Nifty Spot</span><span class="rev-val highlight">${liveNifty}</span></div>
                        <div class="reversal-item"><span class="rev-label">Rule 1: Candle Skip</span><span class="rev-val text-success">Enabled (Candle 2+)</span></div>
                        <div class="reversal-item"><span class="rev-label">Rule 2: Drift Limit</span><span class="rev-val text-info">${rStat.maxDriftPoints || 40} Pts Max Limit</span></div>
                        <div class="reversal-item"><span class="rev-label">Rule 3: Timeout</span><span class="rev-val">${rStat.maxWatchCandles || 6} Candles (30m Max)</span></div>
                        <div class="reversal-item" style="grid-column: 1 / -1;"><span class="rev-label">Last Filter Event</span><span class="rev-val text-muted" style="font-size:0.8rem;">${lastStatusText}</span></div>
                    </div>
                </div>
            `;
        }
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

            const stageLabel = pos.trailingStage || 'INITIAL';
            const isSlShifted = stageLabel.includes('PROFIT_LOCKED');
            const verifyStatusHtml = pos.isVerifiedPlacement !== false 
                ? `<span class="double-check-badge verified">✓ TERMINAL VERIFIED CONFIRMED</span>` 
                : `<span class="double-check-badge unconfirmed">⚠️ UNCONFIRMED RETRYING</span>`;

            posCard.className = "active-trade-card glass-card";
            posCard.innerHTML = `
                <div class="trade-details-grid">
                    <div class="trade-item-box">
                        <div class="item-label">Contract Symbol</div>
                        <div class="item-val">${pos.symbol || 'NIFTY_OPTION'} (Qty: ${pos.qty || 65})</div>
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
                        <div class="item-label">Current Trailed SL</div>
                        <div class="item-val text-danger">₹${pos.currentSl ? Number(pos.currentSl).toFixed(2) : '--'} ${isSlShifted ? '🟢 (SL Shifted)' : ''}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">SL Shift Stage</div>
                        <div class="item-val ${isSlShifted ? 'text-success' : 'text-warning'}">${stageLabel}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Terminal Verification</div>
                        <div class="item-val">${verifyStatusHtml}</div>
                    </div>
                    <div class="trade-item-box">
                        <div class="item-label">Emergency Close Guard</div>
                        <div class="item-val text-success">🛡️ 10 Retries + Emergency Market Close Active</div>
                    </div>
                </div>

                <div class="progress-container">
                    <div class="progress-header">
                        <span>Dynamic Rupee Profit Trailing SL Engine</span>
                        <span>Stage: ${stageLabel}</span>
                    </div>
                    <div class="targets-milestones-row">
                        <span>Initial SL: ₹${pos.initialSl ? Number(pos.initialSl).toFixed(2) : '--'}</span>
                        <span>Current SL: ₹${pos.currentSl ? Number(pos.currentSl).toFixed(2) : '--'}</span>
                        <span>1st Profit Trigger: ₹1,000 (Lock ₹900)</span>
                        <span>Step Jump: Every +₹500</span>
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

