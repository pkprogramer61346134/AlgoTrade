const { candleDataHub } = require('../src/candleDataHub');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const fs = require('fs');

(async () => {
    const masterHeadConfig = JSON.parse(fs.readFileSync('./strategies_config/consensus_master_head.json', 'utf8'));

    const months = [
        { name: 'January 2026', start: '2026-01-01', end: '2026-01-31' },
        { name: 'February 2026', start: '2026-02-01', end: '2026-02-28' },
        { name: 'March 2026', start: '2026-03-01', end: '2026-03-31' },
        { name: 'April 2026', start: '2026-04-01', end: '2026-04-30' },
        { name: 'May 2026', start: '2026-05-01', end: '2026-05-31' },
        { name: 'June 2026', start: '2026-06-01', end: '2026-06-30' },
        { name: 'July 2026', start: '2026-07-01', end: '2026-07-31' },
        { name: 'August 2026', start: '2026-08-01', end: '2026-08-31' },
        { name: 'September 2026', start: '2026-09-01', end: '2026-09-18' }
    ];

    console.log('===================================================================================================================');
    console.log('⚔️ HEAD-TO-HEAD COMPARISON AUDIT: FIXED 1:2.0 R:R vs FIXED 1:3.0 R:R (ALL MONTHS OF 2026)');
    console.log('===================================================================================================================\n');

    function runBacktestWithRR(candles, fixedRRVal) {
        const data = prepareJSONStrategyData(candles, masterHeadConfig);
        const dailyTradeCounts = {};
        const trades = [];
        let openTrade = null;
        let capital = 100000;

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];

            if (openTrade) {
                let exitPrice = null;
                let exitReason = null;

                if (openTrade.type === 'BUY') {
                    if (c.low <= openTrade.stopLoss) {
                        exitPrice = openTrade.stopLoss;
                        exitReason = '🛑 STOP LOSS HIT';
                    } else if (c.high >= openTrade.targetPrice) {
                        exitPrice = openTrade.targetPrice;
                        exitReason = '🎯 TARGET HIT';
                    }
                } else if (openTrade.type === 'SELL') {
                    if (c.high >= openTrade.stopLoss) {
                        exitPrice = openTrade.stopLoss;
                        exitReason = '🛑 STOP LOSS HIT';
                    } else if (c.low <= openTrade.targetPrice) {
                        exitPrice = openTrade.targetPrice;
                        exitReason = '🎯 TARGET HIT';
                    }
                }

                if (!exitPrice && c.time && (c.time.includes('15:00') || c.time.includes('3:00 pm') || c.time.includes('15:05'))) {
                    exitPrice = c.close;
                    exitReason = '🕒 EOD CLOSE';
                }

                if (exitPrice) {
                    const pts = openTrade.type === 'BUY' ? (exitPrice - openTrade.entryPrice) : (openTrade.entryPrice - exitPrice);
                    const pnl = Number((pts * openTrade.qty).toFixed(2));
                    capital += pnl;

                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitPrice,
                        exitReason,
                        points: Number(pts.toFixed(2)),
                        pnl,
                        runningCapital: Number(capital.toFixed(2))
                    });
                    openTrade = null;
                }
            }

            if (!openTrade) {
                const signal = evaluateConsensusEngine(candles, i, masterHeadConfig, data, dailyTradeCounts);
                if (signal && signal.type !== 'NONE') {
                    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
                    const targetPts = Number((risk * fixedRRVal).toFixed(2));
                    const targetPrice = signal.type === 'BUY'
                        ? Number((signal.entryPrice + targetPts).toFixed(2))
                        : Number((signal.entryPrice - targetPts).toFixed(2));

                    openTrade = {
                        date: c.date,
                        time: c.time,
                        type: signal.type,
                        entryPrice: signal.entryPrice,
                        stopLoss: signal.stopLoss,
                        targetPrice: targetPrice,
                        qty: masterHeadConfig.orderQty || 65,
                        riskRewardRatio: `${risk.toFixed(1)}:${targetPts.toFixed(1)} (1:${fixedRRVal.toFixed(1)})`
                    };
                }
            }
        }

        return trades;
    }

    const monthData = [];
    for (const m of months) {
        const candles = await candleDataHub.getCandlesWithWarmup(m.start, m.end, 300);
        monthData.push({ month: m, candles });
    }

    const tableRows = [];

    let total2PnL = 0, total2Trades = 0, total2Wins = 0;
    let total3PnL = 0, total3Trades = 0, total3Wins = 0;

    for (const md of monthData) {
        const m = md.month;

        const trades2 = runBacktestWithRR(md.candles, 2.0).filter(t => t.date >= m.start && t.date <= m.end);
        const pnl2 = trades2.reduce((s, t) => s + (t.pnl || 0), 0);
        const wins2 = trades2.filter(t => t.pnl > 0).length;
        const wr2 = trades2.length > 0 ? ((wins2 / trades2.length) * 100).toFixed(1) : '0.0';

        const trades3 = runBacktestWithRR(md.candles, 3.0).filter(t => t.date >= m.start && t.date <= m.end);
        const pnl3 = trades3.reduce((s, t) => s + (t.pnl || 0), 0);
        const wins3 = trades3.filter(t => t.pnl > 0).length;
        const wr3 = trades3.length > 0 ? ((wins3 / trades3.length) * 100).toFixed(1) : '0.0';

        total2PnL += pnl2; total2Trades += trades2.length; total2Wins += wins2;
        total3PnL += pnl3; total3Trades += trades3.length; total3Wins += wins3;

        let winner = 'DRAW';
        if (pnl2 > pnl3) winner = '🏆 Fixed 1:2.0';
        else if (pnl3 > pnl2) winner = '🚀 Fixed 1:3.0';

        tableRows.push({
            Month: m.name,
            '1:2.0 PnL': `${pnl2 >= 0 ? '+' : ''}₹${Math.round(pnl2).toLocaleString()}`,
            '1:2.0 WR': `${wr2}% (${wins2}/${trades2.length})`,
            '1:3.0 PnL': `${pnl3 >= 0 ? '+' : ''}₹${Math.round(pnl3).toLocaleString()}`,
            '1:3.0 WR': `${wr3}% (${wins3}/${trades3.length})`,
            'Winner': winner
        });
    }

    console.table(tableRows);

    console.log('\n===================================================================================================================');
    console.log('🏆 2026 CUMULATIVE HEAD-TO-HEAD TOTALS (JANUARY TO SEPTEMBER 18, 2026)');
    console.log('===================================================================================================================');
    const overallWR2 = ((total2Wins / total2Trades) * 100).toFixed(2);
    const overallWR3 = ((total3Wins / total3Trades) * 100).toFixed(2);

    console.log(`📌 Fixed 1:2.0 R:R ➔ Total Net PnL: ${total2PnL >= 0 ? '+' : ''}₹${Math.round(total2PnL).toLocaleString()} | Win Rate: ${overallWR2}% (${total2Wins}/${total2Trades} Wins)`);
    console.log(`📌 Fixed 1:3.0 R:R ➔ Total Net PnL: ${total3PnL >= 0 ? '+' : ''}₹${Math.round(total3PnL).toLocaleString()} | Win Rate: ${overallWR3}% (${total3Wins}/${total3Trades} Wins)`);
    console.log('===================================================================================================================\n');
})();
