/**
 * AlgoTrade Backtest Engine - Client-Side App Controller
 * Location: C:\AlgoTrade\server\backtesting\public\app.js
 * Pure Trade-Based & Points-Based Evaluation (No Currency / ₹)
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const backtestForm = document.getElementById('backtestForm');
    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    const intervalSelect = document.getElementById('interval');
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
    const kpiTotalTrades = document.getElementById('kpiTotalTrades');
    const kpiAvgTradePoints = document.getElementById('kpiAvgTradePoints');
    const kpiPassCount = document.getElementById('kpiPassCount');
    const kpiPassRatePercent = document.getElementById('kpiPassRatePercent');
    const kpiLossCount = document.getElementById('kpiLossCount');
    const kpiLossRatePercent = document.getElementById('kpiLossRatePercent');
    const kpiWinrate = document.getElementById('kpiWinrate');
    const kpiSubWinCount = document.getElementById('kpiSubWinCount');
    const kpiSubLossCount = document.getElementById('kpiSubLossCount');
    const kpiNetPoints = document.getElementById('kpiNetPoints');
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
        const maxTradesPerDay = document.getElementById('maxTradesPerDay') ? document.getElementById('maxTradesPerDay').value : 3;
        const slPoints = document.getElementById('slPoints') ? document.getElementById('slPoints').value : 35;
        const targetPoints = document.getElementById('targetPoints') ? document.getElementById('targetPoints').value : 70;

        // Update Server Status
        setRunningState(true);
        progressSection.style.display = 'flex';
        progressBarFill.style.width = '0%';
        progressPercent.textContent = '0%';
        progressStatusText.textContent = `Streaming candles for ${fromDate} to ${toDate}...`;

        tradesTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="10">⚡ Backtest in progress... Processing historical candles tick-by-tick.</td>
            </tr>
        `;

        // Construct SSE stream URL
        const streamUrl = `/api/stream?fromDate=${fromDate}&toDate=${toDate}&interval=${interval}&maxTradesPerDay=${maxTradesPerDay}&slPoints=${slPoints}&targetPoints=${targetPoints}`;
        const eventSource = new EventSource(streamUrl);

        eventSource.addEventListener('progress', (e) => {
            try {
                const data = JSON.parse(e.data);
                const percent = data.percent || 0;
                progressBarFill.style.width = `${percent}%`;
                progressPercent.textContent = `${percent}%`;
                progressStatusText.textContent = `Processing candle ${data.index} of ${data.total} (${data.tick.date} ${data.tick.time})`;
                
                let activeText = `Spot: ${data.tick.close} | Trades Evaluated: ${data.tradeCount || 0}`;
                if (data.activePosition) {
                    activeText += ` | 🟡 OPEN ${data.activePosition.symbol} (Entry Spot: ${data.activePosition.entryPrice})`;
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
     * Render Full Report to UI (Pure Trades & Points Evaluation)
     */
    function renderReport(report) {
        currentReport = report;
        allTrades = report.trades || [];

        const stats = report.stats || {};
        const totalTrades = stats.totalTrades || 0;
        const passTrades = stats.winningTrades || 0;
        const lossTrades = stats.losingTrades || 0;
        const winrate = stats.winrate || '0%';
        const netPoints = stats.netPoints || 0;
        const avgTradePoints = stats.avgTradePoints || 0;
        const profitFactor = stats.profitFactor || '0.00';

        // 1. Total Trades Card
        kpiTotalTrades.textContent = totalTrades;
        tabTradesCount.textContent = totalTrades;
        kpiAvgTradePoints.textContent = `${avgTradePoints >= 0 ? '+' : ''}${avgTradePoints.toFixed(2)} pts`;

        // 2. PASS Trades Card
        kpiPassCount.textContent = `${passTrades} PASS`;
        kpiPassRatePercent.textContent = `${winrate} Win`;

        // 3. LOSS Trades Card
        kpiLossCount.textContent = `${lossTrades} LOSS`;
        const lossPercent = totalTrades > 0 ? `${((lossTrades / totalTrades) * 100).toFixed(1)}%` : '0%';
        kpiLossRatePercent.textContent = `${lossPercent} Loss`;

        // 4. Win Rate Card
        kpiWinrate.textContent = winrate;
        kpiSubWinCount.textContent = `${passTrades} PASS 🟢`;
        kpiSubLossCount.textContent = `${lossTrades} LOSS 🔴`;

        // 5. Net Points Card
        const pointsFormatted = `${netPoints >= 0 ? '+' : ''}${netPoints.toFixed(2)} pts`;
        kpiNetPoints.textContent = pointsFormatted;
        kpiNetPoints.style.color = netPoints >= 0 ? 'var(--success)' : 'var(--danger)';
        kpiProfitFactor.textContent = profitFactor;

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
            const isPass = t.result === 'PASS' || (t.points || 0) > 0;
            const matchesFilter = 
                currentFilter === 'ALL' ||
                (currentFilter === 'WIN' && isPass) ||
                (currentFilter === 'LOSS' && !isPass) ||
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
            const isPass = t.result === 'PASS' || (t.points || 0) > 0;
            const typeBadge = t.optionType === 'CE' 
                ? `<span class="badge badge-success">BUY (CE)</span>` 
                : `<span class="badge badge-danger">SELL (PE)</span>`;

            let reasonBadge = `<span class="badge badge-neutral">${t.exitReason}</span>`;
            if (t.exitReason === 'TARGET_HIT') {
                reasonBadge = `<span class="badge badge-success">🎯 TARGET HIT</span>`;
            } else if (t.exitReason === 'STOP_LOSS_HIT' || (t.exitReason && t.exitReason.includes('SL'))) {
                reasonBadge = `<span class="badge badge-danger">🛑 STOP LOSS HIT</span>`;
            } else if (t.exitReason === 'EOD_SQUARE_OFF') {
                reasonBadge = `<span class="badge badge-neutral">⏰ EOD EXIT</span>`;
            }

            const resultBadge = isPass 
                ? `<span class="badge badge-success">PASS 🟢 (${(t.points || 0) >= 0 ? '+' : ''}${t.points} pts)</span>`
                : `<span class="badge badge-danger">LOSS 🔴 (${t.points} pts)</span>`;

            return `
                <tr>
                    <td><strong>${t.tradeId}</strong></td>
                    <td>${t.entryDate} ${t.entryTime}</td>
                    <td>${typeBadge}</td>
                    <td>${t.entryPrice}</td>
                    <td>${t.initialSl}</td>
                    <td>${t.targetPrice}</td>
                    <td>${t.exitDate} ${t.exitTime}</td>
                    <td>${t.exitPrice}</td>
                    <td>${reasonBadge}</td>
                    <td class="text-right">${resultBadge}</td>
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
            const isWin = (d.netPoints || 0) > 0;
            const ptsColor = isWin ? 'var(--success)' : ((d.netPoints || 0) < 0 ? 'var(--danger)' : 'var(--text-muted)');
            const ptsFormatted = `${isWin ? '+' : ''}${(d.netPoints || 0).toFixed(2)} pts`;

            return `
                <tr>
                    <td><strong>${d.date}</strong></td>
                    <td>${d.totalTrades}</td>
                    <td><span class="win-count">${d.winningTrades} PASS 🟢</span></td>
                    <td><span class="loss-count">${d.losingTrades} LOSS 🔴</span></td>
                    <td>${d.winrate}</td>
                    <td class="text-right" style="color: ${ptsColor}; font-weight: 700;">${ptsFormatted}</td>
                </tr>
            `;
        }).join('');
    }

});
