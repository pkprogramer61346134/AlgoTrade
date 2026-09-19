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

    console.log('===================================================================================================================');
    console.log('🚀 HIGH RISK-REWARD EXPERIMENT AUDIT: FIXED 1:4.0, FIXED 1:5.0, HYBRID 1:2+1:4, HYBRID 1:2+1:5');
    console.log('===================================================================================================================\n');

    function runSingleFixedRR(candles, fixedRRVal) {
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

    function runHybridDualTarget(candles, rr1, rr2) {
        const data = prepareJSONStrategyData(candles, masterHeadConfig);
        const dailyTradeCounts = {};
        const trades = [];
        let openTrade = null;

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];

            if (openTrade) {
                const isBuy = openTrade.type === 'BUY';
                
                let slHit = false;
                if (isBuy && c.low <= openTrade.stopLoss) slHit = true;
                if (!isBuy && c.high >= openTrade.stopLoss) slHit = true;

                if (slHit) {
                    const remQty = openTrade.qty - openTrade.t1QtyExit;
                    const pts = isBuy ? (openTrade.stopLoss - openTrade.entryPrice) : (openTrade.entryPrice - openTrade.stopLoss);
                    const pnl = Number((pts * remQty).toFixed(2));
                    openTrade.totalPnL += pnl;

                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitReason: openTrade.t1Hit ? `🎯 T1 HIT + 🛑 SL HIT ON T2` : '🛑 STOP LOSS HIT',
                        pnl: Number(openTrade.totalPnL.toFixed(2))
                    });
                    openTrade = null;
                    continue;
                }

                if (!openTrade.t1Hit) {
                    let t1HitNow = false;
                    if (isBuy && c.high >= openTrade.t1Price) t1HitNow = true;
                    if (!isBuy && c.low <= openTrade.t1Price) t1HitNow = true;

                    if (t1HitNow) {
                        openTrade.t1Hit = true;
                        openTrade.t1QtyExit = Math.floor(openTrade.qty / 2);
                        const pts = isBuy ? (openTrade.t1Price - openTrade.entryPrice) : (openTrade.entryPrice - openTrade.t1Price);
                        const pnl1 = Number((pts * openTrade.t1QtyExit).toFixed(2));
                        openTrade.totalPnL += pnl1;
                    }
                }

                let t2HitNow = false;
                if (isBuy && c.high >= openTrade.t2Price) t2HitNow = true;
                if (!isBuy && c.low <= openTrade.t2Price) t2HitNow = true;

                if (t2HitNow) {
                    const remQty = openTrade.qty - openTrade.t1QtyExit;
                    const pts = isBuy ? (openTrade.t2Price - openTrade.entryPrice) : (openTrade.entryPrice - openTrade.t2Price);
                    const pnl2 = Number((pts * remQty).toFixed(2));
                    openTrade.totalPnL += pnl2;

                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitReason: `🎯🎯 BOTH T1 (1:${rr1}) & T2 (1:${rr2}) HIT!`,
                        pnl: Number(openTrade.totalPnL.toFixed(2))
                    });
                    openTrade = null;
                    continue;
                }

                if (openTrade && c.time && (c.time.includes('15:00') || c.time.includes('3:00 pm') || c.time.includes('15:05'))) {
                    const remQty = openTrade.qty - openTrade.t1QtyExit;
                    const pts = isBuy ? (c.close - openTrade.entryPrice) : (openTrade.entryPrice - c.close);
                    const eodPnl = Number((pts * remQty).toFixed(2));
                    openTrade.totalPnL += eodPnl;

                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitReason: openTrade.t1Hit ? `🎯 T1 HIT + 🕒 EOD CLOSE ON T2` : '🕒 EOD CLOSE',
                        pnl: Number(openTrade.totalPnL.toFixed(2))
                    });
                    openTrade = null;
                }
            }

            if (!openTrade) {
                const signal = evaluateConsensusEngine(candles, i, masterHeadConfig, data, dailyTradeCounts);
                if (signal && signal.type !== 'NONE') {
                    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
                    const t1Pts = Number((risk * rr1).toFixed(2));
                    const t2Pts = Number((risk * rr2).toFixed(2));

                    const isBuy = signal.type === 'BUY';
                    const t1Price = isBuy ? Number((signal.entryPrice + t1Pts).toFixed(2)) : Number((signal.entryPrice - t1Pts).toFixed(2));
                    const t2Price = isBuy ? Number((signal.entryPrice + t2Pts).toFixed(2)) : Number((signal.entryPrice - t2Pts).toFixed(2));

                    openTrade = {
                        date: c.date,
                        time: c.time,
                        type: signal.type,
                        entryPrice: signal.entryPrice,
                        stopLoss: signal.stopLoss,
                        t1Price,
                        t2Price,
                        t1Hit: false,
                        t1QtyExit: 0,
                        totalPnL: 0,
                        qty: masterHeadConfig.orderQty || 65
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

    const strategies = [
        { label: 'Fixed 1:2.0', fn: candles => runSingleFixedRR(candles, 2.0) },
        { label: 'Fixed 1:3.0', fn: candles => runSingleFixedRR(candles, 3.0) },
        { label: 'Fixed 1:4.0', fn: candles => runSingleFixedRR(candles, 4.0) },
        { label: 'Fixed 1:5.0', fn: candles => runSingleFixedRR(candles, 5.0) },
        { label: 'Hybrid (1:2 + 1:4)', fn: candles => runHybridDualTarget(candles, 2.0, 4.0) },
        { label: 'Hybrid (1:2 + 1:5)', fn: candles => runHybridDualTarget(candles, 2.0, 5.0) }
    ];

    console.log('===================================================================================================================');
    console.log('📊 MULTI-R:R COMPARISON MATRIX FOR FULL YEAR 2026 (JAN - SEP 2026)');
    console.log('===================================================================================================================');

    for (const strat of strategies) {
        let totalPnL = 0;
        let totalTrades = 0;
        let totalWins = 0;

        for (const md of monthData) {
            const m = md.month;
            const trades = strat.fn(md.candles).filter(t => t.date >= m.start && t.date <= m.end);
            const pnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
            totalPnL += pnl;
            totalTrades += trades.length;
            totalWins += trades.filter(t => t.pnl > 0).length;
        }

        const wr = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(2) : '0.00';
        console.log(`📌 ${strat.label.padEnd(22)} ➔ Net PnL = ${totalPnL >= 0 ? '+' : ''}₹${Math.round(totalPnL).toLocaleString().padEnd(10)} | Win Rate = ${wr}% (${totalWins}/${totalTrades} Wins)`);
    }

    console.log('===================================================================================================================\n');
})();
