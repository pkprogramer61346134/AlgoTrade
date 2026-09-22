const { candleDataHub } = require('../Candlehub/candleDataHub');
const indicators = require('../indicators');

(async () => {
    console.log('===================================================================================================================');
    console.log('🔬 ADVANCED PATTERN MINING: DONCHIAN & MULTI-EMA CONFLUENCE (22,722 CANDLES)');
    console.log('===================================================================================================================\n');

    const candles = await candleDataHub.getCandles('2024-01-01', '2026-09-22', 'NIFTY_50', '5');

    const vwap = indicators.trend.calculateVWAP(candles);
    const supertrend = indicators.trend.calculateSupertrend(candles, 10, 3);
    const rvol = indicators.volume.calculateRelativeVolume(candles, 20);
    const rsi = indicators.momentum.calculateRSI(candles, 14);
    const adx = indicators.trend.calculateADX(candles, 14);
    const atr = indicators.volatility.calculateATR(candles, 14);
    const ema10 = indicators.trend.calculateEMA(candles, 10);
    const ema20 = indicators.trend.calculateEMA(candles, 20);
    const ema50 = indicators.trend.calculateEMA(candles, 50);

    // Compute Donchian Channels (20-period)
    const donchian = [];
    for (let i = 0; i < candles.length; i++) {
        if (i < 20) { donchian.push(null); continue; }
        const slice = candles.slice(i - 20, i);
        const upper = Math.max(...slice.map(c => c.high));
        const lower = Math.min(...slice.map(c => c.low));
        donchian.push({ upper, lower });
    }

    const candidateStrats = [
        {
            id: "STRAT_DONCHIAN_BREAKOUT",
            name: "Donchian 20-Period Channel Breakout",
            buyFn: (c, i) => {
                const dc = donchian[i];
                return dc && c.close > dc.upper && vwap[i] && c.close > vwap[i] && rsi[i] >= 55 && rvol[i] >= 1.35;
            },
            sellFn: (c, i) => {
                const dc = donchian[i];
                return dc && c.close < dc.lower && vwap[i] && c.close < vwap[i] && rsi[i] <= 45 && rvol[i] >= 1.35;
            }
        },
        {
            id: "STRAT_TRIPLE_EMA_ALIGNMENT",
            name: "Triple EMA (10/20/50) Stacked Trend",
            buyFn: (c, i) => {
                const e10 = ema10[i], e20 = ema20[i], e50 = ema50[i];
                return e10 && e20 && e50 && e10 > e20 && e20 > e50 && vwap[i] && c.close > vwap[i] && rsi[i] >= 54 && rvol[i] >= 1.30;
            },
            sellFn: (c, i) => {
                const e10 = ema10[i], e20 = ema20[i], e50 = ema50[i];
                return e10 && e20 && e50 && e10 < e20 && e20 < e50 && vwap[i] && c.close < vwap[i] && rsi[i] <= 46 && rvol[i] >= 1.30;
            }
        }
    ];

    const results = [];
    for (const strat of candidateStrats) {
        let openTrade = null, wins = 0, losses = 0, totalPnl = 0, bigTrades = 0;
        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const [h, m] = (c.time || '0:0').split(':').map(Number);
            const totalMins = h * 60 + m;

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

            if (!openTrade && totalMins >= 9 * 60 + 30 && totalMins <= 14 * 60 + 45) {
                const buy = strat.buyFn(c, i);
                const sell = strat.sellFn(c, i);
                if (buy || sell) {
                    const type = buy ? "BUY" : "SELL";
                    const spot = c.close;
                    const atrVal = atr[i] || 15;
                    const risk = Math.max(15, Math.min(35, atrVal * 1.5));
                    const sl = type === "BUY" ? (spot - risk) : (spot + risk);
                    const tp = type === "BUY" ? (spot + risk * 2.8) : (spot - risk * 2.8);
                    openTrade = { type, entry: spot, sl, tp };
                }
            }
        }
        const total = wins + losses;
        const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";
        results.push({
            id: strat.id,
            name: strat.name,
            totalTrades: total, wins, losses, winrate: `${winrate}%`, spotPnl: Number(totalPnl.toFixed(1)), bigTrades
        });
    }

    console.table(results);
})();
