const { candleDataHub } = require('../src/candleDataHub');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const fs = require('fs');

(async () => {
    const masterHeadConfig = JSON.parse(fs.readFileSync('./strategies_config/consensus_master_head.json', 'utf8'));

    const months = [
        { name: 'Jan 2026', start: '2026-01-01', end: '2026-01-31' },
        { name: 'Feb 2026', start: '2026-02-01', end: '2026-02-28' },
        { name: 'Mar 2026', start: '2026-03-01', end: '2026-03-31' },
        { name: 'Apr 2026', start: '2026-04-01', end: '2026-04-30' },
        { name: 'May 2026', start: '2026-05-01', end: '2026-05-31' },
        { name: 'Jun 2026', start: '2026-06-01', end: '2026-06-30' },
        { name: 'Jul 2026', start: '2026-07-01', end: '2026-07-31' },
        { name: 'Aug 2026', start: '2026-08-01', end: '2026-08-31' },
        { name: 'Sep 2026', start: '2026-09-01', end: '2026-09-18' }
    ];

    console.log('==========================================================================================');
    console.log('⚖️ RISK:REWARD COMPARISON EXPERIMENT: FIXED 1:3.0 vs FIXED 1:2.0 vs FIXED 1:1.5 vs DYNAMIC R:R');
    console.log('==========================================================================================\n');

    function runCustomBacktest(candles, rrMode, fixedRRVal = 3.0) {
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
                    let finalTargetPrice = signal.targetPrice;
                    let finalRRStr = signal.riskRewardRatio;

                    if (rrMode === 'FIXED') {
                        const risk = Math.abs(signal.entryPrice - signal.stopLoss);
                        const fixedTargetPts = Number((risk * fixedRRVal).toFixed(2));
                        finalTargetPrice = signal.type === 'BUY' 
                            ? Number((signal.entryPrice + fixedTargetPts).toFixed(2))
                            : Number((signal.entryPrice - fixedTargetPts).toFixed(2));
                        finalRRStr = `${risk.toFixed(1)}:${fixedTargetPts.toFixed(1)} (Fixed 1:${fixedRRVal.toFixed(1)})`;
                    }

                    openTrade = {
                        date: c.date,
                        time: c.time,
                        type: signal.type,
                        entryPrice: signal.entryPrice,
                        stopLoss: signal.stopLoss,
                        targetPrice: finalTargetPrice,
                        qty: masterHeadConfig.orderQty || 65,
                        riskRewardRatio: finalRRStr
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

    const modes = [
        { key: 'fixed_1_15', label: 'Fixed 1:1.5 R:R', mode: 'FIXED', rr: 1.5 },
        { key: 'fixed_1_2',  label: 'Fixed 1:2.0 R:R', mode: 'FIXED', rr: 2.0 },
        { key: 'fixed_1_3',  label: 'Fixed 1:3.0 R:R', mode: 'FIXED', rr: 3.0 },
        { key: 'dynamic',    label: 'Dynamic Adaptive R:R', mode: 'DYNAMIC', rr: 0 }
    ];

    const monthComparison = [];

    for (const md of monthData) {
        const m = md.month;
        const row = { Month: m.name };

        for (const modeObj of modes) {
            const trades = runCustomBacktest(md.candles, modeObj.mode, modeObj.rr);
            const mTrades = trades.filter(t => t.date >= m.start && t.date <= m.end);
            const mPnL = mTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
            const wins = mTrades.filter(t => t.pnl > 0).length;
            const winRate = mTrades.length > 0 ? ((wins / mTrades.length) * 100).toFixed(1) : 0;

            row[modeObj.label + ' PnL'] = `${mPnL >= 0 ? '+' : ''}₹${Math.round(mPnL).toLocaleString()}`;
            row[modeObj.label + ' WR'] = `${winRate}%`;
        }

        monthComparison.push(row);
    }

    console.table(monthComparison);

    console.log('\n==========================================================================================');
    console.log('📊 2026 CUMULATIVE SUMMARY (JAN - SEP 2026) ACROSS ALL MODES');
    console.log('==========================================================================================');

    for (const modeObj of modes) {
        let totalPnL = 0;
        let totalTrades = 0;
        let totalWins = 0;

        for (const md of monthData) {
            const m = md.month;
            const trades = runCustomBacktest(md.candles, modeObj.mode, modeObj.rr);
            const mTrades = trades.filter(t => t.date >= m.start && t.date <= m.end);
            totalPnL += mTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
            totalTrades += mTrades.length;
            totalWins += mTrades.filter(t => t.pnl > 0).length;
        }

        const wr = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(2) : 0;
        console.log(`📌 ${modeObj.label.padEnd(25)}: Net PnL = ${totalPnL >= 0 ? '+' : ''}₹${Math.round(totalPnL).toLocaleString()} | Win Rate = ${wr}% (${totalWins}/${totalTrades} Wins)`);
    }

    console.log('==========================================================================================\n');
})();
