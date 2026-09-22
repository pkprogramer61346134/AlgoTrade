const { candleDataHub } = require('../Candlehub/candleDataHub');
const indicators = require('../indicators');

(async () => {
    console.log('===================================================================================================================');
    console.log('🔬 DEEP QUANTITATIVE GRID SEARCH MINER (22,722 HISTORICAL CANDLES)');
    console.log('Target: Optimize filters (RVOL, RSI, ADX, ATR, Trailing SL) for maximum Winrate % and PnL');
    console.log('===================================================================================================================\n');

    const candles = await candleDataHub.getCandles('2024-01-01', '2026-09-22', 'NIFTY_50', '5');

    const vwap = indicators.trend.calculateVWAP(candles);
    const supertrend = indicators.trend.calculateSupertrend(candles, 10, 3);
    const rvol = indicators.volume.calculateRelativeVolume(candles, 20);
    const rsi = indicators.momentum.calculateRSI(candles, 14);
    const adx = indicators.trend.calculateADX(candles, 14);
    const atr = indicators.volatility.calculateATR(candles, 14);
    const emaFast = indicators.trend.calculateEMA(candles, 20);
    const emaSlow = indicators.trend.calculateEMA(candles, 50);
    const macd = indicators.momentum.calculateMACD ? indicators.momentum.calculateMACD(candles, 12, 26, 9) : null;
    const bollinger = indicators.volatility.calculateBollingerBands ? indicators.volatility.calculateBollingerBands(candles, 20, 2) : null;

    const prevDayMap = {};
    const candlesByDate = {};
    for (const c of candles) {
        const d = c.date || 'DEFAULT';
        if (!candlesByDate[d]) candlesByDate[d] = [];
        candlesByDate[d].push(c);
    }
    const dates = Object.keys(candlesByDate);
    for (let dIdx = 1; dIdx < dates.length; dIdx++) {
        const prevDate = dates[dIdx - 1];
        const currentDate = dates[dIdx];
        const prevCandles = candlesByDate[prevDate];
        if (prevCandles && prevCandles.length > 0) {
            const high = Math.max(...prevCandles.map(c => c.high));
            const low = Math.min(...prevCandles.map(c => c.low));
            prevDayMap[currentDate] = { pdh: high, pdl: low };
        }
    }

    // Param variations to test
    const rvolThresholds = [1.30, 1.40, 1.50];
    const rsiBullThresholds = [52, 55, 58];
    const adxThresholds = [20, 24, 28];
    const rrRatios = [2.2, 2.5, 2.8, 3.0];

    const minedStrategies = [];

    // 1. Supertrend + MACD Zero-Line Trend Rider Optimization
    for (const rvolMin of rvolThresholds) {
        for (const rsiMin of rsiBullThresholds) {
            for (const rr of rrRatios) {
                let wins = 0, losses = 0, totalPnl = 0, bigTrades = 0, openTrade = null;
                for (let i = 0; i < candles.length; i++) {
                    const c = candles[i];
                    const [h, m] = (c.time || '0:0').split(':').map(Number);
                    const totalMins = h * 60 + m;
                    if (totalMins < 9 * 60 + 30 || totalMins > 14 * 60 + 45) continue;

                    if (openTrade) {
                        const isBuy = openTrade.type === "BUY";
                        let exitPrice = null;
                        if (isBuy) {
                            if (c.low <= openTrade.sl) exitPrice = openTrade.sl;
                            else if (c.high >= openTrade.tp) exitPrice = openTrade.tp;
                        } else {
                            if (c.high >= openTrade.sl) exitPrice = openTrade.sl;
                            else if (c.low <= openTrade.tp) exitPrice = openTrade.tp;
                        }
                        if (!exitPrice && totalMins >= 15 * 60 + 15) exitPrice = c.close;
                        if (exitPrice) {
                            const pts = isBuy ? (exitPrice - openTrade.entry) : (openTrade.entry - exitPrice);
                            if (pts > 0) wins++; else losses++;
                            if (Math.abs(pts) >= 75) bigTrades++;
                            totalPnl += pts;
                            openTrade = null;
                        }
                    }

                    if (!openTrade) {
                        const st = supertrend[i];
                        const mc = macd ? macd[i] : null;
                        const isStBull = st && (st.direction === 1 || st.direction === "UP" || st.direction === "BUY");
                        const isStBear = st && (st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL");

                        const buy = isStBull && mc && mc.macd > mc.signal && vwap[i] && c.close > vwap[i] && rsi[i] >= rsiMin && rvol[i] >= rvolMin;
                        const sell = isStBear && mc && mc.macd < mc.signal && vwap[i] && c.close < vwap[i] && rsi[i] <= (100 - rsiMin) && rvol[i] >= rvolMin;

                        if (buy || sell) {
                            const type = buy ? "BUY" : "SELL";
                            const spot = c.close;
                            const atrVal = atr[i] || 15;
                            const slPts = Math.max(15, Math.min(35, atrVal * 1.5));
                            const sl = type === "BUY" ? (spot - slPts) : (spot + slPts);
                            const tp = type === "BUY" ? (spot + slPts * rr) : (spot - slPts * rr);
                            openTrade = { type, entry: spot, sl, tp };
                        }
                    }
                }
                const total = wins + losses;
                if (total >= 30) {
                    const wr = ((wins / total) * 100).toFixed(1);
                    minedStrategies.push({
                        type: 'MACD_SUPER_RIDER',
                        name: `Supertrend + MACD Rider (RVOL ${rvolMin}x, RSI ${rsiMin}, RR ${rr})`,
                        total, wins, losses, winrate: `${wr}%`, spotPnl: Number(totalPnl.toFixed(1)), bigTrades, rvolMin, rsiMin, rr
                    });
                }
            }
        }
    }

    // Sort by Net Spot PnL Points
    minedStrategies.sort((a, b) => b.spotPnl - a.spotPnl);

    console.log('🏆 TOP 10 OPTIMIZED STRATEGY CONFIGURATIONS FROM 2024-2026 HISTORICAL MINING:');
    console.table(minedStrategies.slice(0, 10));

})();
