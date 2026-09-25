/**
 * AlgoTrade Backtest Engine - Client-Side App Controller
 * Location: C:\AlgoTrade\server\backtesting\public\app.js
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const backtestForm = document.getElementById('backtestForm');
    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    const intervalSelect = document.getElementById('interval');
    const initialBalanceInput = document.getElementById('initialBalance');
    const lotsInput = document.getElementById('lots');
    const runBacktestBtn = document.getElementById('runBacktestBtn');
    const loadReportBtn = document.getElementById('loadReportBtn');

    // Server Status & Progress
    const serverStatusBadge = document.getElementById('serverStatusBadge');
    const serverStatusText = document.getElementById('serverStatusText');
    const progressSection = document.getElementById('progressSection');
    const progressStatusText = document.getElementById('progressStatusText');
    const progressPercent = document.getElementById('progressPercent');
    const progressBarFill = document.getElementById('progressBarFill');
    const liveTickerText = document.getElementById('liveTickerText');

    // KPI Metrics
    const kpiNetPnlCard = document.getElementById('kpiNetPnlCard');
    const kpiNetPnl = document.getElementById('kpiNetPnl');
    const kpiNetPnlPercent = document.getElementById('kpiNetPnlPercent');
    const kpiWinrate = document.getElementById('kpiWinrate');
    const kpiWinCount = document.getElementById('kpiWinCount');
    const kpiLossCount = document.getElementById('kpiLossCount');
    const kpiTotalTrades = document.getElementById('kpiTotalTrades');
    const kpiAvgTradePnl = document.getElementById('kpiAvgTradePnl');
    const kpiMaxDrawdown = document.getElementById('kpiMaxDrawdown');
    const kpiMaxDrawdownPercent = document.getElementById('kpiMaxDrawdownPercent');
    const kpiProfitFactor = document.getElementById('kpiProfitFactor');
    const tabTradesCount = document.getElementById('tabTradesCount');

    // Tabs & Tables
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const tradesTableBody = document.getElementById('tradesTableBody');
    const dailyTableBody = document.getElementById('dailyTableBody');
    const tradeSearchInput = document.getElementById('tradeSearchInput');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Local State
    let currentReport = null;
    let allTrades = [];
    let currentFilter = 'ALL';
    let searchQuery = '';

    // Initialize UI
    init();

    async function init() {
        setupTabs();
        setupFilters();
        await fetchCachedDates();
        await loadLatestReport();
    }

    /**
     * Fetch available cached dates from server
     */
    async function fetchCachedDates() {
        try {
            const res = await fetch('/api/cached-dates');
            const data = await res.json();
            if (data.status === 'success' && data.dates && data.dates.length > 0) {
                fromDateInput.value = data.minDate;
                toDateInput.value = data.maxDate;
            }
        } catch (e) {
            console.warn('Unable to load cached dates:', e.message);
        }
    }

    /**
     * Load existing report from server
     */
    async function loadLatestReport() {
        try {
            const res = await fetch('/api/report');
            const data = await res.json();
            if (data.status === 'success' && data.report) {
                renderReport(data.report);
            }
        } catch (e) {
            console.log('No initial report found.');
        }
    }

    /**
     * Tab Switching Logic
     */
    function setupTabs() {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');

                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
    }

    /**
     * Filter Buttons & Search Input Logic
     */
    function setupFilters() {
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.getAttribute('data-filter');
                renderTradesTable();
            });
        });

        tradeSearchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderTradesTable();
        });
    }

    /**
     * Run Backtest Handler (SSE Streaming)
     */
    backtestForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fromDate = fromDateInput.value;
        const toDate = toDateInput.value;
        const interval = intervalSelect.value;
        const initialBalance = initialBalanceInput.value;
        const lots = lotsInput.value;
        const maxTradesPerDay = document.getElementById('maxTradesPerDay') ? document.getElementById('maxTradesPerDay').value : 3;
        const targetMode = document.getElementById('targetMode') ? document.getElementById('targetMode').value : 'TRAILING';
        const maxLossPerTrade = document.getElementById('maxLossPerTrade') ? document.getElementById('maxLossPerTrade').value : 300;

        // Update Server Status
        setRunningState(true);
        progressSection.style.display = 'flex';
        progressBarFill.style.width = '0%';
        progressPercent.textContent = '0%';
        progressStatusText.textContent = `Streaming candles for ${fromDate} to ${toDate}...`;

        // Reset UI metrics temporarily
        tradesTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="10">⚡ Backtest in progress... Processing historical candles tick-by-tick.</td>
            </tr>
        `;

        // Construct SSE stream URL
        const streamUrl = `/api/stream?fromDate=${fromDate}&toDate=${toDate}&interval=${interval}&initialBalance=${initialBalance}&lots=${lots}&maxTradesPerDay=${maxTradesPerDay}&targetMode=${targetMode}&maxLossPerTrade=${maxLossPerTrade}`;
        const eventSource = new EventSource(streamUrl);

        eventSource.addEventListener('progress', (e) => {
            try {
                const data = JSON.parse(e.data);
                const percent = data.percent || 0;
                progressBarFill.style.width = `${percent}%`;
                progressPercent.textContent = `${percent}%`;
                progressStatusText.textContent = `Processing candle ${data.index} of ${data.total} (${data.tick.date} ${data.tick.time})`;
                
                let activeText = `Close: ₹${data.tick.close} | Active Trades: ${data.tradeCount || 0}`;
                if (data.activePosition) {
                    activeText += ` | 🟡 OPEN ${data.activePosition.symbol} (Entry: ₹${data.activePosition.entryPrice})`;
                }
                liveTickerText.innerHTML = `<span class="ticker-dot"></span> ${activeText}`;
            } catch (err) {}
        });

        eventSource.addEventListener('complete', (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.report) {
                    renderReport(data.report);
                }
            } catch (err) {}
            eventSource.close();
            setRunningState(false);
            progressSection.style.display = 'none';
        });

        eventSource.addEventListener('error', (e) => {
            console.error('SSE Error:', e);
            eventSource.close();
            setRunningState(false);
            progressSection.style.display = 'none';
            alert('Backtest execution failed or connection closed.');
        });
    });

    loadReportBtn.addEventListener('click', loadLatestReport);

    function setRunningState(isRunning) {
        if (isRunning) {
            serverStatusBadge.className = 'status-badge running';
            serverStatusText.textContent = 'Running Backtest...';
            runBacktestBtn.disabled = true;
            runBacktestBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Running...`;
        } else {
            serverStatusBadge.className = 'status-badge idle';
            serverStatusText.textContent = 'Engine Ready';
            runBacktestBtn.disabled = false;
            runBacktestBtn.innerHTML = `<i class="fa-solid fa-play"></i> Run Backtest`;
        }
    }

    /**
     * Render Full Report to UI
     */
    function renderReport(report) {
        currentReport = report;
        allTrades = report.trades || [];

        const stats = report.stats || {};
        const netPnl = report.netPnl || 0;

        // 1. Net PnL Card
        kpiNetPnl.textContent = `₹${netPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        kpiNetPnlPercent.textContent = report.netPnlPercent || '0%';
        if (netPnl >= 0) {
            kpiNetPnlCard.style.borderColor = 'var(--success-border)';
            kpiNetPnl.style.color = 'var(--success)';
            kpiNetPnlPercent.className = 'badge badge-success';
        } else {
            kpiNetPnlCard.style.borderColor = 'var(--danger-border)';
            kpiNetPnl.style.color = 'var(--danger)';
            kpiNetPnlPercent.className = 'badge badge-danger';
        }

        // 2. Win Rate Card
        kpiWinrate.textContent = stats.winrate || '0%';
        kpiWinCount.textContent = `${stats.winningTrades || 0} Wins 🟢`;
        kpiLossCount.textContent = `${stats.losingTrades || 0} Losses 🔴`;

        // 3. Total Trades Card
        kpiTotalTrades.textContent = stats.totalTrades || 0;
        tabTradesCount.textContent = stats.totalTrades || 0;
        kpiAvgTradePnl.textContent = `₹${(stats.avgTradePnl || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

        // 4. Max Drawdown Card
        kpiMaxDrawdown.textContent = `₹${(stats.maxDrawdown || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        kpiMaxDrawdownPercent.textContent = stats.maxDrawdownPercent || '0%';

        // 5. Profit Factor Card
        kpiProfitFactor.textContent = stats.profitFactor || '0.00';
        const targetRrText = document.getElementById('kpiTargetRr');
        const targetModeSelect = document.getElementById('targetMode');
        if (stats.targetMode) {
            if (targetModeSelect) targetModeSelect.value = stats.targetMode;
            if (targetRrText) {
                if (stats.targetMode.includes('1:1')) targetRrText.textContent = '1 : 1 (TR1)';
                else if (stats.targetMode.includes('1:2')) targetRrText.textContent = '1 : 2 (TR2)';
                else if (stats.targetMode.includes('1:3')) targetRrText.textContent = '1 : 3 (TR3)';
                else if (stats.targetMode.includes('1:4')) targetRrText.textContent = '1 : 4 (TR4)';
                else targetRrText.textContent = '4-Stage Trailing';
            }
        }
        const maxLossInput = document.getElementById('maxLossPerTrade');
        if (stats.maxLossPerTrade !== undefined && maxLossInput) {
            maxLossInput.value = stats.maxLossPerTrade;
        }

        // Render Tables
        renderTradesTable();
        renderDailyTable(report.dailyBreakdown || []);
    }

    /**
     * Render Trades Audit Log Table with Filters
     */
    function renderTradesTable() {
        if (!allTrades || allTrades.length === 0) {
            tradesTableBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="10">No trades executed during this backtest period.</td>
                </tr>
            `;
            return;
        }

        const filtered = allTrades.filter(t => {
            const matchesFilter = 
                currentFilter === 'ALL' ||
                (currentFilter === 'WIN' && t.realizedPnl > 0) ||
                (currentFilter === 'LOSS' && t.realizedPnl < 0) ||
                (currentFilter === 'CE' && t.optionType === 'CE') ||
                (currentFilter === 'PE' && t.optionType === 'PE');

            if (!matchesFilter) return false;

            if (!searchQuery) return true;
            const searchStr = `${t.tradeId} ${t.entryDate} ${t.entryTime} ${t.optionType} ${t.exitReason}`.toLowerCase();
            return searchStr.includes(searchQuery);
        });

        if (filtered.length === 0) {
            tradesTableBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="10">No trades matching current filter criteria.</td>
                </tr>
            `;
            return;
        }

        tradesTableBody.innerHTML = filtered.map(t => {
            const isWin = (t.realizedPnl || 0) > 0;
            const typeBadge = t.optionType === 'CE' 
                ? `<span class="badge badge-success">BUY (CE)</span>` 
                : `<span class="badge badge-danger">SELL (PE)</span>`;

            let reasonBadge = `<span class="badge badge-neutral">${t.exitReason}</span>`;
            if (t.exitReason.includes('TR4')) {
                reasonBadge = `<span class="badge badge-success">🎯 TR4 TARGET (1:4)</span>`;
            } else if (t.exitReason.includes('TRAILED')) {
                reasonBadge = `<span class="badge badge-success">🔄 ${t.exitReason}</span>`;
            } else if (t.exitReason.includes('INITIAL_SL')) {
                reasonBadge = `<span class="badge badge-danger">🛑 INITIAL SL HIT</span>`;
            }

            const pnlColor = isWin ? 'var(--success)' : (t.realizedPnl < 0 ? 'var(--danger)' : 'var(--text-muted)');
            const pnlFormatted = `${isWin ? '+' : ''}₹${(t.realizedPnl || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

            return `
                <tr>
                    <td><strong>${t.tradeId}</strong></td>
                    <td>${t.entryDate} ${t.entryTime}</td>
                    <td>${typeBadge}</td>
                    <td>₹${t.entryPrice}</td>
                    <td>₹${t.initialSl}</td>
                    <td>₹${t.targetTr4}</td>
                    <td>${t.exitDate} ${t.exitTime}</td>
                    <td>₹${t.exitPrice}</td>
                    <td>${reasonBadge}</td>
                    <td class="text-right" style="color: ${pnlColor}; font-weight: 700;">${pnlFormatted}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Render Daily Breakdown Table
     */
    function renderDailyTable(dailyList) {
        if (!dailyList || dailyList.length === 0) {
            dailyTableBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">No daily breakdown available.</td>
                </tr>
            `;
            return;
        }

        dailyTableBody.innerHTML = dailyList.map(d => {
            const isWin = d.pnl > 0;
            const pnlColor = isWin ? 'var(--success)' : (d.pnl < 0 ? 'var(--danger)' : 'var(--text-muted)');
            const pnlFormatted = `${isWin ? '+' : ''}₹${d.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

            return `
                <tr>
                    <td><strong>${d.date}</strong></td>
                    <td>${d.totalTrades}</td>
                    <td><span class="win-count">${d.winningTrades} 🟢</span></td>
                    <td><span class="loss-count">${d.losingTrades} 🔴</span></td>
                    <td>${d.winrate}</td>
                    <td class="text-right" style="color: ${pnlColor}; font-weight: 700;">${pnlFormatted}</td>
                </tr>
            `;
        }).join('');
    }

});
