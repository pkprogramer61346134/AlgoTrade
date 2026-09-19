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
    console.log('🚀 MULTI-TIER HYBRID AUDIT: 3-TIER (1:2 + 1:3 + 1:5) & 4-TIER (1:2 + 1:3 + 1:4 + 1:5)');
    console.log('===================================================================================================================\n');

    function runMultiTierHybrid(candles, targets) {
        // targets array e.g. [ { rr: 2.0, pct: 0.33 }, { rr: 3.0, pct: 0.33 }, { rr: 5.0, pct: 0.34 } ]
        const data = prepareJSONStrategyData(candles, masterHeadConfig);
        const dailyTradeCounts = {};
        const trades = [];
        let openTrade = null;

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];

            if (openTrade) {
                const isBuy = openTrade.type === 'BUY';
                
                // Check SL Hit first
                let slHit = false;
                if (isBuy && c.low <= openTrade.stopLoss) slHit = true;
                if (!isBuy && c.high >= openTrade.stopLoss) slHit = true;

                if (slHit) {
                    const remQty = openTrade.qty - openTrade.exitedQty;
                    if (remQty > 0) {
                        const pts = isBuy ? (openTrade.stopLoss - openTrade.entryPrice) : (openTrade.entryPrice - openTrade.stopLoss);
                        const pnl = Number((pts * remQty).toFixed(2));
                        openTrade.totalPnL += pnl;
                    }

                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitReason: openTrade.exitedQty > 0 ? `🎯 TARGET EXITS + 🛑 SL ON REMAINING` : '🛑 STOP LOSS HIT',
                        pnl: Number(openTrade.totalPnL.toFixed(2))
                    });
                    openTrade = null;
                    continue;
                }

                // Check Targets sequential exits
                for (let tIdx = 0; tIdx < openTrade.tierList.length; tIdx++) {
                    const tier = openTrade.tierList[tIdx];
                    if (!tier.hit) {
                        let tierHitNow = false;
                        if (isBuy && c.high >= tier.price) tierHitNow = true;
                        if (!isBuy && c.low <= tier.price) tierHitNow = true;

                        if (tierHitNow) {
                            tier.hit = true;
                            const pts = isBuy ? (tier.price - openTrade.entryPrice) : (openTrade.entryPrice - tier.price);
                            const tierPnl = Number((pts * tier.qty).toFixed(2));
                            openTrade.totalPnL += tierPnl;
                            openTrade.exitedQty += tier.qty;
                        }
                    }
                }

                // All tiers hit?
                if (openTrade.tierList.every(t => t.hit)) {
                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitReason: '🎯🎯 ALL HYBRID TARGET TIERS HIT!',
                        pnl: Number(openTrade.totalPnL.toFixed(2))
                    });
                    openTrade = null;
                    continue;
                }

                // Check 3:00 PM EOD Squareoff
                if (openTrade && c.time && (c.time.includes('15:00') || c.time.includes('3:00 pm') || c.time.includes('15:05'))) {
                    const remQty = openTrade.qty - openTrade.exitedQty;
                    if (remQty > 0) {
                        const pts = isBuy ? (c.close - openTrade.entryPrice) : (openTrade.entryPrice - c.close);
                        const eodPnl = Number((pts * remQty).toFixed(2));
                        openTrade.totalPnL += eodPnl;
                    }

                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitReason: openTrade.exitedQty > 0 ? '🎯 PARTIAL TARGETS HIT + 🕒 EOD CLOSE' : '🕒 EOD CLOSE',
                        pnl: Number(openTrade.totalPnL.toFixed(2))
                    });
                    openTrade = null;
                }
            }

            if (!openTrade) {
                const signal = evaluateConsensusEngine(candles, i, masterHeadConfig, data, dailyTradeCounts);
                if (signal && signal.type !== 'NONE') {
                    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
                    const isBuy = signal.type === 'BUY';
                    const totalQty = masterHeadConfig.orderQty || 65;

                    let allocatedQty = 0;
                    const tierList = targets.map((t, idx) => {
                        const tPts = Number((risk * t.rr).toFixed(2));
                        const price = isBuy ? Number((signal.entryPrice + tPts).toFixed(2)) : Number((signal.entryPrice - tPts).toFixed(2));
                        
                        let qty = Math.floor(totalQty * t.pct);
                        if (idx === targets.length - 1) {
                            qty = totalQty - allocatedQty; // Assign remainder to final tier
                        }
                        allocatedQty += qty;

                        return {
                            rr: t.rr,
                            price,
                            qty,
                            hit: false
                        };
                    });

                    openTrade = {
                        date: c.date,
                        time: c.time,
                        type: signal.type,
                        entryPrice: signal.entryPrice,
                        stopLoss: signal.stopLoss,
                        tierList,
                        exitedQty: 0,
                        totalPnL: 0,
                        qty: totalQty
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
        {
            name: '3-Tier Hybrid (1:2 + 1:3 + 1:5)',
            targets: [
                { rr: 2.0, pct: 0.33 },
                { rr: 3.0, pct: 0.33 },
                { rr: 5.0, pct: 0.34 }
            ]
        },
        {
            name: '4-Tier Hybrid (1:2 + 1:3 + 1:4 + 1:5)',
            targets: [
                { rr: 2.0, pct: 0.25 },
                { rr: 3.0, pct: 0.25 },
                { rr: 4.0, pct: 0.25 },
                { rr: 5.0, pct: 0.25 }
            ]
        },
        {
            name: '3-Tier Aggressive (1:2 + 1:4 + 1:5)',
            targets: [
                { rr: 2.0, pct: 0.33 },
                { rr: 4.0, pct: 0.33 },
                { rr: 5.0, pct: 0.34 }
            ]
        }
    ];

    console.log('===================================================================================================================');
    console.log('📊 MULTI-TIER HYBRID AUDIT RESULTS FOR FULL YEAR 2026 (JAN - SEP 2026)');
    console.log('===================================================================================================================');

    for (const modeObj of modes) {
        let totalPnL = 0;
        let totalTrades = 0;
        let totalWins = 0;

        for (const md of monthData) {
            const m = md.month;
            const trades = runMultiTierHybrid(md.candles, modeObj.targets).filter(t => t.date >= m.start && t.date <= m.end);
            const pnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
            totalPnL += pnl;
            totalTrades += trades.length;
            totalWins += trades.filter(t => t.pnl > 0).length;
        }

        const wr = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(2) : '0.00';
        console.log(`📌 ${modeObj.name.padEnd(38)} ➔ Net PnL = ${totalPnL >= 0 ? '+' : ''}₹${Math.round(totalPnL).toLocaleString().padEnd(10)} | Win Rate = ${wr}% (${totalWins}/${totalTrades} Wins)`);
    }

    console.log('===================================================================================================================\n');
})();
