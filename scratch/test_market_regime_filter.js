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
    console.log('🛡️ REGIME FILTER TEST: FILTERING SIDEWAYS CHOPPY MONTHS (ADX TREND FILTER + MAX LOSS/DAY LOCK)');
    console.log('===================================================================================================================\n');

    function runRegimeFilteredBacktest(candles, minADXRequired = 20, maxDailyLossLimit = 3000) {
        const data = prepareJSONStrategyData(candles, masterHeadConfig);
        const dailyTradeCounts = {};
        const dailyPnL = {};
        const trades = [];
        let openTrade = null;

        const targets = [
            { rr: 2.0, pct: 0.33 },
            { rr: 4.0, pct: 0.33 },
            { rr: 5.0, pct: 0.34 }
        ];

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];

            // Daily Max Loss Guard: If day's total loss exceeds limit, stop trading for rest of the day
            if (dailyPnL[c.date] && dailyPnL[c.date] <= -maxDailyLossLimit) {
                if (openTrade) {
                    // Close trade
                } else {
                    continue; // Skip new trade entries for the rest of this choppy day!
                }
            }

            if (openTrade) {
                const isBuy = openTrade.type === 'BUY';
                
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

                    dailyPnL[c.date] = (dailyPnL[c.date] || 0) + openTrade.totalPnL;

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

                if (openTrade.tierList.every(t => t.hit)) {
                    dailyPnL[c.date] = (dailyPnL[c.date] || 0) + openTrade.totalPnL;
                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitReason: '🎯🎯 ALL 3 HYBRID TARGETS HIT!',
                        pnl: Number(openTrade.totalPnL.toFixed(2))
                    });
                    openTrade = null;
                    continue;
                }

                if (openTrade && c.time && (c.time.includes('15:00') || c.time.includes('3:00 pm') || c.time.includes('15:05'))) {
                    const remQty = openTrade.qty - openTrade.exitedQty;
                    if (remQty > 0) {
                        const pts = isBuy ? (c.close - openTrade.entryPrice) : (openTrade.entryPrice - c.close);
                        const eodPnl = Number((pts * remQty).toFixed(2));
                        openTrade.totalPnL += eodPnl;
                    }

                    dailyPnL[c.date] = (dailyPnL[c.date] || 0) + openTrade.totalPnL;

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
                // ADX Trend Filter Check: If ADX is below minADXRequired, market is sideways choppy! Skip trade entry.
                const currADX = data.adx && data.adx[i] !== null ? data.adx[i] : 25;
                if (currADX < minADXRequired) continue;

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
                            qty = totalQty - allocatedQty;
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

    const configs = [
        { label: 'Unfiltered 3-Tier Hybrid', minADX: 0, maxLoss: 99999 },
        { label: 'With Daily Max Loss Guard (₹3,000)', minADX: 0, maxLoss: 3000 },
        { label: 'With ADX Trend Filter (ADX >= 20)', minADX: 20, maxLoss: 99999 },
        { label: '🔥 Master Filter (ADX >= 20 + ₹3,000 Loss Guard)', minADX: 20, maxLoss: 3000 }
    ];

    for (const cfg of configs) {
        console.log(`\n📌 RUNNING AUDIT FOR: ${cfg.label}`);
        const summaryTable = [];
        let totalPnL = 0;
        let totalTrades = 0;
        let totalWins = 0;

        for (const md of monthData) {
            const m = md.month;
            const trades = runRegimeFilteredBacktest(md.candles, cfg.minADX, cfg.maxLoss).filter(t => t.date >= m.start && t.date <= m.end);
            const mPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
            const wins = trades.filter(t => t.pnl > 0).length;
            const wr = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : '0.0';

            totalPnL += mPnL;
            totalTrades += trades.length;
            totalWins += wins;

            summaryTable.push({
                Month: m.name,
                Trades: trades.length,
                WinRate: `${wr}% (${wins}/${trades.length})`,
                'Net PnL (₹)': `${mPnL >= 0 ? '+' : ''}₹${Math.round(mPnL).toLocaleString()}`
            });
        }

        console.table(summaryTable);
        const wrPct = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(2) : '0.00';
        console.log(`➡️ ${cfg.label} TOTAL: Net PnL = ${totalPnL >= 0 ? '+' : ''}₹${Math.round(totalPnL).toLocaleString()} | Win Rate = ${wrPct}% (${totalWins}/${totalTrades} Wins)`);
    }
})();
