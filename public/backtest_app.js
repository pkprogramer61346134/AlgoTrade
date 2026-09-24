/**
 * AlgoTrade Pro Dedicated Backtest Engine Client JavaScript
 * Location: C:\AlgoTrade\public\backtest_app.js
 */

const API_BASE = window.location.origin;

setInterval(updateClock, 1000);

document.addEventListener("DOMContentLoaded", () => {
    updateClock();
});

function updateClock() {
    const clockEl = document.getElementById("clock-display");
    if (clockEl) {
        clockEl.innerText = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
    }
}

async function fetchLastBacktestReport() {
    try {
        const res = await fetch(`${API_BASE}/api/backtest/report`).then(r => r.json());
        if (res.status === "success" && res.data) {
            renderBacktestResults(res.data);
        }
    } catch (e) {
        console.warn("Notice fetching last report:", e.message);
    }
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
        interval: document.getElementById("bt-interval").value,
        riskRewardRatio: Number(document.getElementById("bt-rr-ratio").value)
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
    container.scrollIntoView({ behavior: "smooth" });

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



    // Render Trades Table
    const tbody = document.getElementById("bt-history-tbody");
    const trades = data.trades || [];

    if (trades.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted">No trades triggered during backtest period.</td></tr>`;
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
                    <td><span class="badge-neutral">${t.rrRatio || '1:2'}</span></td>
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
