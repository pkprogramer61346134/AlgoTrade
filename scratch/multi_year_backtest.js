const OrderExecutionManager = require('../order_config/orderExecutionManager');
const { candleDataHub } = require('../src/candleDataHub');
const fs = require('fs');

(async () => {
    const masterHeadConfig = JSON.parse(fs.readFileSync('./strategies_config/consensus_master_head.json', 'utf8'));
    const orderMgr = new OrderExecutionManager();

    console.log('===================================================================================');
    console.log('📊 MULTI-YEAR HISTORICAL BACKTEST AUDIT: FIXED 1:2.0 R:R (DHAN API CANDLE DATA)');
    console.log('===================================================================================\n');

    // Years to backtest: 2024, 2025, 2026
    const years = ['2024', '2025', '2026'];
    const monthNames = [
        '01', '02', '03', '04', '05', '06',
        '07', '08', '09', '10', '11', '12'
    ];

    const yearlyReports = {};

    for (const yr of years) {
        console.log(`\n⏳ Running Backtest Audit for Year ${yr}...`);
        const yearSummary = [];
        let yrPnL = 0;
        let yrTrades = 0;
        let yrWins = 0;
        let yrLosses = 0;

        for (const mm of monthNames) {
            // Stop at September 2026 if current year is 2026
            if (yr === '2026' && parseInt(mm) > 9) break;

            const daysInMonth = new Date(parseInt(yr), parseInt(mm), 0).getDate();
            const startStr = `${yr}-${mm}-01`;
            const endStr = `${yr}-${mm}-${daysInMonth < 10 ? '0' + daysInMonth : daysInMonth}`;

            try {
                const candles = await candleDataHub.getCandlesWithWarmup(startStr, endStr, 300);
                const result = orderMgr.runBacktest(candles, masterHeadConfig, 100000);

                const monthTrades = result.trades.filter(t => t.date >= startStr && t.date <= endStr);
                const monthPnL = monthTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
                const wins = monthTrades.filter(t => t.pnl > 0).length;
                const losses = monthTrades.filter(t => t.pnl <= 0).length;
                const winRate = monthTrades.length > 0 ? ((wins / monthTrades.length) * 100).toFixed(1) : '0.0';

                yrPnL += monthPnL;
                yrTrades += monthTrades.length;
                yrWins += wins;
                yrLosses += losses;

                yearSummary.push({
                    Month: `${yr}-${mm}`,
                    Trades: monthTrades.length,
                    WinRate: `${winRate}%`,
                    Wins: wins,
                    Losses: losses,
                    NetPnL: `${monthPnL >= 0 ? '+' : ''}₹${Math.round(monthPnL).toLocaleString()}`
                });
            } catch (err) {
                console.error(`Error processing ${startStr} to ${endStr}:`, err.message);
            }
        }

        console.table(yearSummary);
        const yrWinRate = yrTrades > 0 ? ((yrWins / yrTrades) * 100).toFixed(2) : '0.00';
        console.log(`📌 YEAR ${yr} TOTAL: Net PnL = ${yrPnL >= 0 ? '+' : ''}₹${Math.round(yrPnL).toLocaleString()} | Win Rate = ${yrWinRate}% (${yrWins}/${yrTrades} Wins)`);

        yearlyReports[yr] = {
            totalPnL: yrPnL,
            totalTrades: yrTrades,
            wins: yrWins,
            losses: yrLosses,
            winRate: yrWinRate
        };
    }

    console.log('\n===================================================================================');
    console.log('🏆 MULTI-YEAR CUMULATIVE BACKTEST SUMMARY (FIXED 1:2.0 R:R)');
    console.log('===================================================================================');
    let grandPnL = 0;
    let grandTrades = 0;
    let grandWins = 0;

    for (const [yr, rep] of Object.entries(yearlyReports)) {
        grandPnL += rep.totalPnL;
        grandTrades += rep.totalTrades;
        grandWins += rep.wins;
        console.log(`  Year ${yr}: Net PnL = ${rep.totalPnL >= 0 ? '+' : ''}₹${Math.round(rep.totalPnL).toLocaleString()} | Win Rate = ${rep.winRate}%`);
    }

    const grandWR = grandTrades > 0 ? ((grandWins / grandTrades) * 100).toFixed(2) : '0.00';
    console.log('-----------------------------------------------------------------------------------');
    console.log(`  GRAND TOTAL PnL Across ${Object.keys(yearlyReports).length} Years: ${grandPnL >= 0 ? '+' : ''}₹${Math.round(grandPnL).toLocaleString()}`);
    console.log(`  GRAND WIN RATE: ${grandWR}% (${grandWins}/${grandTrades} Wins)`);
    console.log('===================================================================================\n');
})();
