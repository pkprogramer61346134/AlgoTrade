const OrderExecutionManager = require('../order_config/orderExecutionManager');
const { candleDataHub } = require('../src/candleDataHub');
const fs = require('fs');

(async () => {
    const masterHeadConfig = JSON.parse(fs.readFileSync('./strategies_config/consensus_master_head.json', 'utf8'));
    const orderMgr = new OrderExecutionManager();

    console.log('===================================================================================');
    console.log('🏛️ FULL 8-YEAR HISTORICAL BACKTEST AUDIT (2018 TO 2026)');
    console.log('📊 MASTER HEAD CONSENSUS ENGINE (FIXED 1:2.0 R:R + MINED OPTIMAL THRESHOLDS)');
    console.log('===================================================================================\n');

    const years = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];
    const monthNames = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

    const yearlyReport = [];
    let grandPnL = 0;
    let grandTrades = 0;
    let grandWins = 0;
    let grandLosses = 0;

    for (const yr of years) {
        console.log(`⏳ Processing Year ${yr}...`);
        let yrPnL = 0;
        let yrTrades = 0;
        let yrWins = 0;
        let yrLosses = 0;

        for (const mm of monthNames) {
            if (yr === '2026' && parseInt(mm) > 9) break;

            const daysInMonth = new Date(parseInt(yr), parseInt(mm), 0).getDate();
            const startStr = `${yr}-${mm}-01`;
            const endStr = `${yr}-${mm}-${daysInMonth < 10 ? '0' + daysInMonth : daysInMonth}`;

            try {
                const candles = await candleDataHub.getCandlesWithWarmup(startStr, endStr, 300);
                const res = orderMgr.runBacktest(candles, masterHeadConfig, 100000);
                const mTrades = res.trades.filter(t => t.date >= startStr && t.date <= endStr);

                const mPnL = mTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
                const wins = mTrades.filter(t => t.pnl > 0).length;
                const losses = mTrades.filter(t => t.pnl <= 0).length;

                yrPnL += mPnL;
                yrTrades += mTrades.length;
                yrWins += wins;
                yrLosses += losses;
            } catch (err) {
                console.error(`Error loading ${startStr}:`, err.message);
            }
        }

        grandPnL += yrPnL;
        grandTrades += yrTrades;
        grandWins += yrWins;
        grandLosses += yrLosses;

        const winRate = yrTrades > 0 ? ((yrWins / yrTrades) * 100).toFixed(2) : '0.00';
        const returnPct = ((yrPnL / 100000) * 100).toFixed(2);

        yearlyReport.push({
            Year: yr,
            Trades: yrTrades,
            WinRate: `${winRate}%`,
            Wins: yrWins,
            Losses: yrLosses,
            'Yearly Net PnL (₹)': `${yrPnL >= 0 ? '+' : ''}₹${Math.round(yrPnL).toLocaleString()}`,
            'Return %': `${returnPct >= 0 ? '+' : ''}${returnPct}%`,
            Status: yrPnL >= 0 ? '🟢 PROFIT' : '🔴 LOSS'
        });
    }

    console.table(yearlyReport);

    console.log('\n===================================================================================');
    console.log('🏆 GRAND CUMULATIVE SUMMARY FOR ALL 8 YEARS (2018 - 2026)');
    console.log('===================================================================================');
    const grandWR = grandTrades > 0 ? ((grandWins / grandTrades) * 100).toFixed(2) : '0.00';
    const grandReturnPct = ((grandPnL / 100000) * 100).toFixed(2);

    console.log(`  Base Capital Per Month   : ₹100,000`);
    console.log(`  Grand Total Net PnL (₹)  : ${grandPnL >= 0 ? '+' : ''}₹${Math.round(grandPnL).toLocaleString()} (${grandReturnPct}%)`);
    console.log(`  Grand Total Trades       : ${grandTrades} Trades`);
    console.log(`  Grand Win Rate           : ${grandWR}% (${grandWins} Wins / ${grandLosses} Losses)`);
    console.log('===================================================================================\n');
})();
