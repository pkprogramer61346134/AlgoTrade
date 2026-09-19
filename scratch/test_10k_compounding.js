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

    console.log('========================================================================================================');
    console.log('🛡️ SAFE COMPOUNDING AUDIT (STARTING CAPITAL ₹10,000 + 10% MAX RISK PER TRADE CAP)');
    console.log('========================================================================================================\n');

    let walletBalance = 10000;
    const tableRows = [];

    for (const m of months) {
        const startWallet = walletBalance;
        const candles = await candleDataHub.getCandlesWithWarmup(m.start, m.end, 300);
        const data = prepareJSONStrategyData(candles, masterHeadConfig);
        const dailyTradeCounts = {};

        let openTrade = null;
        let monthPnL = 0;

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];

            if (openTrade) {
                const isBuy = openTrade.type === 'BUY';
                let exitPrice = null;

                if (isBuy) {
                    if (c.low <= openTrade.stopLoss) exitPrice = openTrade.stopLoss;
                    else if (c.high >= openTrade.targetPrice) exitPrice = openTrade.targetPrice;
                } else {
                    if (c.high >= openTrade.stopLoss) exitPrice = openTrade.stopLoss;
                    else if (c.low <= openTrade.targetPrice) exitPrice = openTrade.targetPrice;
                }

                if (!exitPrice && c.time && (c.time.includes('15:00') || c.time.includes('3:00 pm') || c.time.includes('15:05'))) {
                    exitPrice = c.close;
                }

                if (exitPrice) {
                    const pts = isBuy ? (exitPrice - openTrade.entryPrice) : (openTrade.entryPrice - exitPrice);
                    let pnl = pts * openTrade.qty;
                    
                    // Cap max loss per trade at 10% of current wallet balance
                    const maxLossCap = walletBalance * 0.10;
                    if (pnl < -maxLossCap) pnl = -maxLossCap;

                    monthPnL += pnl;
                    walletBalance += pnl;
                    if (walletBalance < 2000) walletBalance = 2000; // Protection floor
                    openTrade = null;
                }
            }

            if (!openTrade) {
                const signal = evaluateConsensusEngine(candles, i, masterHeadConfig, data, dailyTradeCounts);
                if (signal && signal.type !== 'NONE') {
                    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
                    const targetPts = Number((risk * 2.0).toFixed(2));
                    const targetPrice = signal.type === 'BUY'
                        ? Number((signal.entryPrice + targetPts).toFixed(2))
                        : Number((signal.entryPrice - targetPts).toFixed(2));

                    openTrade = {
                        date: c.date,
                        type: signal.type,
                        entryPrice: signal.entryPrice,
                        stopLoss: signal.stopLoss,
                        targetPrice,
                        qty: 65
                    };
                }
            }
        }

        tableRows.push({
            Month: m.name,
            'Month Start Wallet': `₹${Math.round(startWallet).toLocaleString()}`,
            'Month Net PnL (₹)': `${monthPnL >= 0 ? '+' : ''}₹${Math.round(monthPnL).toLocaleString()}`,
            'Month End Wallet': `₹${Math.round(walletBalance).toLocaleString()}`,
            'Status': monthPnL >= 0 ? '🟢 PROFIT' : '🔴 LOSS'
        });
    }

    console.table(tableRows);
})();
