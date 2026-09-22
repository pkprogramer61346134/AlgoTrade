const { candleDataHub } = require('../Candlehub/candleDataHub');
const { evaluateConsensusEngine } = require('../head/consensusEngine');

(async () => {
    console.log('===================================================================================================================');
    console.log('🔬 AUDITING 2026 WITH 2-STRATEGY CONSENSUS CONFLUENCE (MIN 2 STRATEGIES AGREEING)');
    console.log('Target: Filter out single-strategy false breakouts in August 2026 chop');
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
    const report = [];

    for (const mObj of months) {
        const candles = await candleDataHub.getCandles(mObj.startStr, mObj.endStr, 'NIFTY_50', '5');
        if (!candles || candles.length === 0) continue;

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
                
                // Count votes for BUY vs SELL across 10 strategies
                const buySignals = activeSignals.filter(s => s.type === "BUY");
                const sellSignals = activeSignals.filter(s => s.type === "SELL");

                let selectedSignal = null;
                if (buySignals.length >= 2) selectedSignal = buySignals[0];
                else if (sellSignals.length >= 2) selectedSignal = sellSignals[0];

                if (selectedSignal) {
                    const type = selectedSignal.type;
                    const spot = c.close;
                    const slPrice = selectedSignal.sl || (type === "BUY" ? spot - 25 : spot + 25);
                    const riskPts = Math.abs(spot - slPrice);
                    const sl = slPrice;
                    const tpMax = type === "BUY" ? (spot + riskPts * 5.0) : (spot - riskPts * 5.0);

                    openTrade = { type, entry: spot, sl, tpMax, riskPts, lastTrailingR: 0 };
                }
            }
        }

        const totalTrades = wins + losses;
        const winrate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
        const netRupees = totalPnlSpot * 0.50 * 50;
        cumulativeCapital += netRupees;

        report.push({
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

    console.table(report);
    console.log(`\n💰 Final Account Balance (Consensus >= 2 Votes): ₹${Number(cumulativeCapital.toFixed(0)).toLocaleString('en-IN')}`);

})();
