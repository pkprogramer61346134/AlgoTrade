const { candleDataHub } = require('../src/candleDataHub');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const fs = require('fs');

(async () => {
    const baseConfig = JSON.parse(fs.readFileSync('./strategies_config/consensus_master_head.json', 'utf8'));

    const optimizedConfig = JSON.parse(JSON.stringify(baseConfig));
    optimizedConfig.indicators.rvolMin = 1.35; // Data mined volume surge threshold
    optimizedConfig.indicators.rsiBullMin = 54; // Data mined RSI momentum threshold
    optimizedConfig.indicators.rsiBearMax = 46;
    optimizedConfig.indicators.adxMin = 22; // Data mined ADX trend regime threshold

    console.log('===================================================================================================================');
    console.log('⚖️ COMPARISON AUDIT: DEFAULT THRESHOLDS vs DATA-MINED OPTIMIZED THRESHOLDS (2024-2026)');
    console.log('===================================================================================================================\n');

    const years = ['2024', '2025', '2026'];
    const monthNames = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

    function runBacktestWithConfig(candles, stratCfg) {
        const data = prepareJSONStrategyData(candles, stratCfg);
        const dailyTradeCounts = {};
        const trades = [];
        let openTrade = null;

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
                    const pnl = Number((pts * openTrade.qty).toFixed(2));
                    trades.push({ ...openTrade, exitPrice, pnl });
                    openTrade = null;
                }
            }

            if (!openTrade) {
                // If optimized config, check ADX >= 22 trend regime filter
                if (stratCfg.indicators.adxMin) {
                    const currADX = data.adx && data.adx[i] !== null ? data.adx[i] : 20;
                    if (currADX < stratCfg.indicators.adxMin) continue;
                }

                const signal = evaluateConsensusEngine(candles, i, stratCfg, data, dailyTradeCounts);
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

        return trades;
    }

    const yearlyResults = {};

    for (const yr of years) {
        let basePnL = 0, baseTrades = 0, baseWins = 0;
        let optPnL = 0, optTrades = 0, optWins = 0;

        for (const mm of monthNames) {
            if (yr === '2026' && parseInt(mm) > 9) break;

            const daysInMonth = new Date(parseInt(yr), parseInt(mm), 0).getDate();
            const startStr = `${yr}-${mm}-01`;
            const endStr = `${yr}-${mm}-${daysInMonth < 10 ? '0' + daysInMonth : daysInMonth}`;

            try {
                const candles = await candleDataHub.getCandlesWithWarmup(startStr, endStr, 300);
                
                const bTrades = runBacktestWithConfig(candles, baseConfig).filter(t => t.date >= startStr && t.date <= endStr);
                const bPnL = bTrades.reduce((s, t) => s + (t.pnl || 0), 0);
                basePnL += bPnL; baseTrades += bTrades.length; baseWins += bTrades.filter(t => t.pnl > 0).length;

                const oTrades = runBacktestWithConfig(candles, optimizedConfig).filter(t => t.date >= startStr && t.date <= endStr);
                const oPnL = oTrades.reduce((s, t) => s + (t.pnl || 0), 0);
                optPnL += oPnL; optTrades += oTrades.length; optWins += oTrades.filter(t => t.pnl > 0).length;
            } catch (e) {}
        }

        yearlyResults[yr] = {
            basePnL, baseTrades, baseWins,
            optPnL, optTrades, optWins
        };
    }

    console.table(
        Object.entries(yearlyResults).map(([yr, r]) => ({
            Year: yr,
            'Baseline PnL': `${r.basePnL >= 0 ? '+' : ''}₹${Math.round(r.basePnL).toLocaleString()}`,
            'Baseline WinRate': `${((r.baseWins / (r.baseTrades || 1)) * 100).toFixed(1)}% (${r.baseWins}/${r.baseTrades})`,
            'Optimized PnL': `${r.optPnL >= 0 ? '+' : ''}₹${Math.round(r.optPnL).toLocaleString()}`,
            'Optimized WinRate': `${((r.optWins / (r.optTrades || 1)) * 100).toFixed(1)}% (${r.optWins}/${r.optTrades})`,
            'Improvement': `${r.optPnL > r.basePnL ? '🚀 +' : ''}₹${Math.round(r.optPnL - r.basePnL).toLocaleString()}`
        }))
    );
    console.log('===================================================================================================================\n');
})();
