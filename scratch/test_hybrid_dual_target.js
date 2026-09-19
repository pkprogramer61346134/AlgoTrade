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
    console.log('🚀 HYBRID DUAL-TARGET AUDIT: PARTIAL EXIT (50% QTY @ 1:2.0 R:R + 50% QTY @ 1:3.0 R:R)');
    console.log('===================================================================================================================\n');

    function runHybridDualTargetBacktest(candles) {
        const data = prepareJSONStrategyData(candles, masterHeadConfig);
        const dailyTradeCounts = {};
        const trades = [];
        let openTrade = null;
        let capital = 100000;

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];

            if (openTrade) {
                const isBuy = openTrade.type === 'BUY';
                
                // Check SL Hit first
                let slHit = false;
                if (isBuy && c.low <= openTrade.stopLoss) slHit = true;
                if (!isBuy && c.high >= openTrade.stopLoss) slHit = true;

                if (slHit) {
                    // Close remaining quantity at Stop Loss
                    const remQty = openTrade.qty - openTrade.t1QtyExit;
                    const pts = isBuy ? (openTrade.stopLoss - openTrade.entryPrice) : (openTrade.entryPrice - openTrade.stopLoss);
                    const pnl = Number((pts * remQty).toFixed(2));
                    openTrade.totalPnL += pnl;

                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitReason: openTrade.t1Hit ? '🎯 T1 HIT + 🛑 SL HIT ON T2' : '🛑 STOP LOSS HIT',
                        pnl: Number(openTrade.totalPnL.toFixed(2))
                    });
                    openTrade = null;
                    continue;
                }

                // Check Target 1 Hit (1:2.0 R:R)
                if (!openTrade.t1Hit) {
                    let t1HitNow = false;
                    if (isBuy && c.high >= openTrade.t1Price) t1HitNow = true;
                    if (!isBuy && c.low <= openTrade.t1Price) t1HitNow = true;

                    if (t1HitNow) {
                        openTrade.t1Hit = true;
                        openTrade.t1QtyExit = Math.floor(openTrade.qty / 2); // 50% exit
                        const pts = isBuy ? (openTrade.t1Price - openTrade.entryPrice) : (openTrade.entryPrice - openTrade.t1Price);
                        const pnl1 = Number((pts * openTrade.t1QtyExit).toFixed(2));
                        openTrade.totalPnL += pnl1;
                    }
                }

                // Check Target 2 Hit (1:3.0 R:R)
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
                        exitReason: openTrade.t1Hit ? '🎯🎯 BOTH T1 (1:2) & T2 (1:3) HIT!' : '🎯 T2 HIT DIRECT',
                        pnl: Number(openTrade.totalPnL.toFixed(2))
                    });
                    openTrade = null;
                    continue;
                }

                // Check 3:00 PM EOD Squareoff
                if (openTrade && c.time && (c.time.includes('15:00') || c.time.includes('3:00 pm') || c.time.includes('15:05'))) {
                    const remQty = openTrade.qty - openTrade.t1QtyExit;
                    const pts = isBuy ? (c.close - openTrade.entryPrice) : (openTrade.entryPrice - c.close);
                    const eodPnl = Number((pts * remQty).toFixed(2));
                    openTrade.totalPnL += eodPnl;

                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitReason: openTrade.t1Hit ? '🎯 T1 HIT + 🕒 EOD CLOSE ON T2' : '🕒 EOD CLOSE',
                        pnl: Number(openTrade.totalPnL.toFixed(2))
                    });
                    openTrade = null;
                }
            }

            if (!openTrade) {
                const signal = evaluateConsensusEngine(candles, i, masterHeadConfig, data, dailyTradeCounts);
                if (signal && signal.type !== 'NONE') {
                    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
                    const t1Pts = Number((risk * 2.0).toFixed(2));
                    const t2Pts = Number((risk * 3.0).toFixed(2));

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
                        qty: masterHeadConfig.orderQty || 65,
                        riskRewardRatio: `${risk.toFixed(1)}: ${t1Pts.toFixed(1)} (50%) & ${t2Pts.toFixed(1)} (50%)`
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
    let totalHybridPnL = 0;
    let totalTradesCount = 0;
    let totalWinsCount = 0;

    for (const md of monthData) {
        const m = md.month;
        const trades = runHybridDualTargetBacktest(md.candles).filter(t => t.date >= m.start && t.date <= m.end);
        const monthPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const wins = trades.filter(t => t.pnl > 0).length;
        const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : '0.0';

        totalHybridPnL += monthPnL;
        totalTradesCount += trades.length;
        totalWinsCount += wins;

        tableRows.push({
            Month: m.name,
            Trades: trades.length,
            WinRate: `${winRate}% (${wins}/${trades.length})`,
            'Hybrid Net PnL (₹)': `${monthPnL >= 0 ? '+' : ''}₹${Math.round(monthPnL).toLocaleString()}`,
            'Return %': `${((monthPnL / 100000) * 100).toFixed(2)}%`
        });
    }

    console.table(tableRows);

    console.log('\n===================================================================================================================');
    console.log('🏆 2026 HYBRID DUAL-TARGET CUMULATIVE SUMMARY (50% @ 1:2.0 + 50% @ 1:3.0)');
    console.log('===================================================================================================================');
    const overallWR = ((totalWinsCount / totalTradesCount) * 100).toFixed(2);
    console.log(`📌 HYBRID DUAL-TARGET SYSTEM ➔ Total Net PnL: ${totalHybridPnL >= 0 ? '+' : ''}₹${Math.round(totalHybridPnL).toLocaleString()} | Win Rate: ${overallWR}% (${totalWinsCount}/${totalTradesCount} Wins)`);
    console.log('===================================================================================================================\n');
})();
