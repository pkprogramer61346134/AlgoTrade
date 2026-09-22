const { candleDataHub } = require('../Candlehub/candleDataHub');
const { evaluateConsensusEngine } = require('../head/consensusEngine');

(async () => {
    console.log('===================================================================================================================');
    console.log('📊 2026 FULL YEAR MONTH-BY-MONTH QUANTITATIVE BACKTEST REPORT (JAN 2026 - SEP 2026)');
    console.log('10 Core Daily Active Strategies | Min 1:1.5 Profit Lock -> 1:5+ Trailing SL | 1 Lot (50 Qty)');
    console.log('===================================================================================================================\n');

    const months = [
        { name: 'January 2026', startStr: '2026-01-01', endStr: '2026-01-31' },
        { name: 'February 2026', startStr: '2026-02-01', endStr: '2026-02-28' },
        { name: 'March 2026', startStr: '2026-03-01', endStr: '2026-03-31' },
        { name: 'April 2026', startStr: '2026-04-01', endStr: '2026-04-30' },
        { name: 'May 2026', startStr: '2026-05-01', endStr: '2026-05-31' },
        { name: 'June 2026', startStr: '2026-06-01', endStr: '2026-06-30' },
        { name: 'July 2026', startStr: '2026-07-01', endStr: '2026-07-31' },
        { name: 'August 2026', startStr: '2026-08-01', endStr: '2026-08-31' },
        { name: 'September 2026', startStr: '2026-09-01', endStr: '2026-09-22' }
    ];

    const trailingSteps = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
    let cumulativeCapital = 100000.0;
    const monthlyReport = [];

    for (const mObj of months) {
        console.log(`⏳ Loading & Backtesting ${mObj.name} (${mObj.startStr} to ${mObj.endStr})...`);
        let candles = [];
        try {
            candles = await candleDataHub.getCandlesWithWarmup ? 
                await candleDataHub.getCandlesWithWarmup(mObj.startStr, mObj.endStr, 200) : 
                await candleDataHub.getCandles(mObj.startStr, mObj.endStr, 'NIFTY_50', '5');
        } catch (e) {
            console.error(`Error loading ${mObj.name}:`, e.message);
        }

        if (!candles || candles.length === 0) {
            monthlyReport.push({
                Month: mObj.name,
                Candles: 0, TotalTrades: 0, Wins: 0, Losses: 0, Winrate: '0.0%',
                SpotPts: 0, NetPnlRupees: '₹0', AccountBalance: `₹${cumulativeCapital.toLocaleString('en-IN')}`
            });
            continue;
        }

        let openTrade = null;
        let wins = 0, losses = 0, totalPnlSpot = 0;

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const [h, m] = (c.time || '0:0').split(':').map(Number);
            const totalMins = h * 60 + m;
            const isPrimeWindow = totalMins >= 9 * 60 + 30 && totalMins <= 14 * 60 + 45;

            if (openTrade) {
                const isBuy = openTrade.type === "BUY";
                const spot = c.close;
                const priceDiff = isBuy ? (spot - openTrade.entry) : (openTrade.entry - spot);
                const currentR = priceDiff / openTrade.riskPts;

                // 1.5x Min Lock to 5.0x Max Runner Trailing SL
                for (const stepR of trailingSteps) {
                    if (currentR >= stepR && openTrade.lastTrailingR < stepR) {
                        openTrade.lastTrailingR = stepR;
                        const lockedSLPts = openTrade.riskPts * (stepR - 1.0);
                        const newSL = isBuy ? (openTrade.entry + lockedSLPts) : (openTrade.entry - lockedSLPts);
                        if (isBuy ? (newSL > openTrade.sl) : (newSL < openTrade.sl)) {
                            openTrade.sl = newSL;
                        }
                    }
                }

                let exitPrice = null;
                if (isBuy) {
                    if (c.low <= openTrade.sl) exitPrice = openTrade.sl;
                    else if (c.high >= openTrade.tpMax) exitPrice = openTrade.tpMax;
                } else {
                    if (c.high >= openTrade.sl) exitPrice = openTrade.sl;
                    else if (c.low <= openTrade.tpMax) exitPrice = openTrade.tpMax;
                }

                if (!exitPrice && totalMins >= 15 * 60 + 15) exitPrice = c.close;

                if (exitPrice) {
                    const pts = isBuy ? (exitPrice - openTrade.entry) : (openTrade.entry - exitPrice);
                    if (pts > 0) wins++; else losses++;
                    totalPnlSpot += pts;
                    openTrade = null;
                }
            }

            if (!openTrade && isPrimeWindow) {
                const activeSignals = evaluateConsensusEngine(candles, i);
                if (activeSignals && activeSignals.length > 0) {
                    const sig = activeSignals[0]; // Take top consensus strategy signal
                    const type = sig.type;
                    const spot = c.close;
                    const slPrice = sig.sl || (type === "BUY" ? spot - 25 : spot + 25);
                    const riskPts = Math.abs(spot - slPrice);
                    const sl = slPrice;
                    const tpMax = type === "BUY" ? (spot + riskPts * 5.0) : (spot - riskPts * 5.0);

                    openTrade = { type, entry: spot, sl, tpMax, riskPts, lastTrailingR: 0 };
                }
            }
        }

        const totalTrades = wins + losses;
        const winrate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
        const netRupees = totalPnlSpot * 0.50 * 50; // Option Delta ~0.50 * 50 Qty (1 Lot)
        cumulativeCapital += netRupees;

        monthlyReport.push({
            Month: mObj.name,
            Candles: candles.length,
            TotalTrades: totalTrades,
            Wins: wins,
            Losses: losses,
            Winrate: `${winrate}%`,
            SpotPts: Number(totalPnlSpot.toFixed(1)),
            NetPnlRupees: `${netRupees >= 0 ? '+' : ''}₹${Number(netRupees.toFixed(0)).toLocaleString('en-IN')}`,
            AccountBalance: `₹${Number(cumulativeCapital.toFixed(0)).toLocaleString('en-IN')}`
        });
    }

    console.log('\n===================================================================================================================');
    console.log('🏆 2026 MONTH-BY-MONTH BACKTEST PERFORMANCE REPORT');
    console.log('===================================================================================================================');
    console.table(monthlyReport);

    console.log(`\n💰 Starting Capital: ₹100,000.00`);
    console.log(`📈 Final Account Balance (Sep 2026): ₹${Number(cumulativeCapital.toFixed(0)).toLocaleString('en-IN')}`);
    console.log(`🚀 Total 2026 Net PnL: ${cumulativeCapital - 100000 >= 0 ? '+' : ''}₹${Number((cumulativeCapital - 100000).toFixed(0)).toLocaleString('en-IN')} (${(((cumulativeCapital - 100000) / 100000) * 100).toFixed(1)}% Return)`);

})();
