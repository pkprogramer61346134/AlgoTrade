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
    console.log('🔥 3-TIER AGGRESSIVE HYBRID (1:2 + 1:4 + 1:5): MONTH-BY-MONTH P&L REPORT (2026)');
    console.log('===================================================================================================================\n');

    function run3TierHybrid(candles) {
        const data = prepareJSONStrategyData(candles, masterHeadConfig);
        const dailyTradeCounts = {};
        const trades = [];
        let openTrade = null;

        const targets = [
            { rr: 2.0, pct: 0.33 },
            { rr: 4.0, pct: 0.33 },
            { rr: 5.0, pct: 0.34 }
        ];

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];

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
                    trades.push({
                        ...openTrade,
                        exitTime: c.time,
                        exitDate: c.date,
                        exitReason: '🎯🎯 ALL 3 HYBRID TARGETS HIT (1:2, 1:4, 1:5)!',
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

    const summaryTable = [];
    let grandTotalPnL = 0;
    let grandTotalTrades = 0;
    let grandTotalWins = 0;

    for (const md of monthData) {
        const m = md.month;
        const trades = run3TierHybrid(md.candles).filter(t => t.date >= m.start && t.date <= m.end);
        const mPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const wins = trades.filter(t => t.pnl > 0).length;
        const losses = trades.filter(t => t.pnl <= 0).length;
        const wr = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : '0.0';

        grandTotalPnL += mPnL;
        grandTotalTrades += trades.length;
        grandTotalWins += wins;

        summaryTable.push({
            Month: m.name,
            Trades: trades.length,
            WinRate: `${wr}% (${wins}/${trades.length})`,
            Wins: wins,
            Losses: losses,
            'Net PnL (₹)': `${mPnL >= 0 ? '+' : ''}₹${Math.round(mPnL).toLocaleString()}`,
            'Return %': `${((mPnL / 100000) * 100).toFixed(2)}%`
        });
    }

    console.table(summaryTable);

    console.log('\n===================================================================================================================');
    console.log('🏆 2026 FULL YEAR SUMMARY: 3-TIER AGGRESSIVE HYBRID (1:2 + 1:4 + 1:5)');
    console.log('===================================================================================================================');
    const grandWR = grandTotalTrades > 0 ? ((grandTotalWins / grandTotalTrades) * 100).toFixed(2) : '0.00';
    console.log(`  Base Capital Per Month   : ₹100,000`);
    console.log(`  Total Net PnL Across 2026: ${grandTotalPnL >= 0 ? '+' : ''}₹${Math.round(grandTotalPnL).toLocaleString()} (${((grandTotalPnL / 100000) * 100).toFixed(2)}%)`);
    console.log(`  Total Trades Executed    : ${grandTotalTrades} Trades`);
    console.log(`  Overall Win Rate         : ${grandWR}% (${grandTotalWins} Wins / ${grandTotalTrades - grandTotalWins} Losses)`);
    console.log('===================================================================================================================\n');
})();
