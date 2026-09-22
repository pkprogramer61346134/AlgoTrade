const { candleDataHub } = require('../Candlehub/candleDataHub');
const indicators = require('../indicators');

(async () => {
    console.log('===================================================================================================================');
    console.log('🔬 TRAILING SL MULTI-YEAR STRATEGY OPTIMIZATION (22,722 HISTORICAL CANDLES)');
    console.log('Testing Trailing SL (1R Breathing Room) to boost Win Rate & Capital Growth');
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

    const trailingSteps = [1.5, 2.5, 3.0, 4.0, 5.0];

    const strategyCandidates = [
        {
            id: "STRAT_6_MINED_MACD_SUPER",
            name: "Mined: Supertrend + MACD Zero-Cross Rider",
            buyFn: (c, i) => {
                const st = supertrend[i];
                const mc = macd ? macd[i] : null;
                const isStBull = st && (st.direction === 1 || st.direction === "UP" || st.direction === "BUY");
                return isStBull && mc && mc.macd > mc.signal && vwap[i] && c.close > vwap[i] && rsi[i] >= 53 && rvol[i] >= 1.30;
            },
            sellFn: (c, i) => {
                const st = supertrend[i];
                const mc = macd ? macd[i] : null;
                const isStBear = st && (st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL");
                return isStBear && mc && mc.macd < mc.signal && vwap[i] && c.close < vwap[i] && rsi[i] <= 47 && rvol[i] >= 1.30;
            }
        },
        {
            id: "STRAT_7_MINED_ATR_SURGE",
            name: "Mined: ATR Volatility Expansion Surge",
            buyFn: (c, i) => {
                const range = Math.abs(c.high - c.low);
                const atrVal = atr[i] || 15;
                return range >= (atrVal * 1.8) && vwap[i] && c.close > vwap[i] && rsi[i] >= 56 && rvol[i] >= 1.40;
            },
            sellFn: (c, i) => {
                const range = Math.abs(c.high - c.low);
                const atrVal = atr[i] || 15;
                return range >= (atrVal * 1.8) && vwap[i] && c.close < vwap[i] && rsi[i] <= 44 && rvol[i] >= 1.40;
            }
        },
        {
            id: "STRAT_8_MINED_PDH_PDL",
            name: "Mined: Previous Day PDH/PDL Level Breakout",
            buyFn: (c, i) => {
                const pd = prevDayMap[c.date];
                return pd && pd.pdh && c.close > pd.pdh && vwap[i] && c.close > vwap[i] && rsi[i] >= 55 && rvol[i] >= 1.35;
            },
            sellFn: (c, i) => {
                const pd = prevDayMap[c.date];
                return pd && pd.pdl && c.close < pd.pdl && vwap[i] && c.close < vwap[i] && rsi[i] <= 45 && rvol[i] >= 1.35;
            }
        },
        {
            id: "STRAT_9_MINED_VWAP_PULLBACK",
            name: "Mined: VWAP Pullback Re-entry Trend",
            buyFn: (c, i) => {
                const eF = emaFast[i], eS = emaSlow[i];
                return eF && eS && eF > eS && vwap[i] && c.close > vwap[i] && c.low <= vwap[i] * 1.002 && rsi[i] >= 52 && rvol[i] >= 1.25;
            },
            sellFn: (c, i) => {
                const eF = emaFast[i], eS = emaSlow[i];
                return eF && eS && eF < eS && vwap[i] && c.close < vwap[i] && c.high >= vwap[i] * 0.998 && rsi[i] <= 48 && rvol[i] >= 1.25;
            }
        },
        {
            id: "STRAT_10_MINED_BOLLINGER_SQUEEZE",
            name: "Mined: Bollinger Band Squeeze Explosion",
            buyFn: (c, i) => {
                const bb = bollinger ? bollinger[i] : null;
                const adxVal = adx[i] ? adx[i].adx : 20;
                return bb && bb.upper && c.close > bb.upper && adxVal >= 22 && rsi[i] >= 58 && rvol[i] >= 1.40;
            },
            sellFn: (c, i) => {
                const bb = bollinger ? bollinger[i] : null;
                const adxVal = adx[i] ? adx[i].adx : 20;
                return bb && bb.lower && c.close < bb.lower && adxVal >= 22 && rsi[i] <= 42 && rvol[i] >= 1.40;
            }
        },
        {
            id: "STRAT_11_MINED_HIGH_ADX_RALLIER",
            name: "Mined: High-ADX Prolonged Trend Rallier",
            buyFn: (c, i) => {
                const st = supertrend[i];
                const isStBull = st && (st.direction === 1 || st.direction === "UP" || st.direction === "BUY");
                const adxVal = adx[i] ? adx[i].adx : 20;
                return adxVal >= 26 && isStBull && vwap[i] && c.close > vwap[i] && rvol[i] >= 1.35;
            },
            sellFn: (c, i) => {
                const st = supertrend[i];
                const isStBear = st && (st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL");
                const adxVal = adx[i] ? adx[i].adx : 20;
                return adxVal >= 26 && isStBear && vwap[i] && c.close < vwap[i] && rvol[i] >= 1.35;
            }
        }
    ];

    const results = [];

    for (const strat of strategyCandidates) {
        let openTrade = null;
        let wins = 0, losses = 0, totalPnl = 0, bigTrades = 0;

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const [h, m] = (c.time || '0:0').split(':').map(Number);
            const totalMins = h * 60 + m;

            if (openTrade) {
                const isBuy = openTrade.type === "BUY";
                const spot = c.close;
                const priceDiff = isBuy ? (spot - openTrade.entry) : (openTrade.entry - spot);
                const currentR = priceDiff / openTrade.riskPts;

                // Update Trailing SL
                for (const stepR of trailingSteps) {
                    if (currentR >= stepR && openTrade.lastTrailingR < stepR) {
                        openTrade.lastTrailingR = stepR;
                        const lockedSLPts = openTrade.riskPts * (stepR - 1.0);
                        const newSL = isBuy ? (openTrade.entry + lockedSLPts) : (openTrade.entry - lockedSLPts);
                        if (isBuy ? (newSL > openTrade.sl) : (newSL < openTrade.sl)) {
                            openTrade.sl = newSL;
                        }
                    }
                }

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
                const isBuy = strat.buyFn(c, i);
                const isSell = strat.sellFn(c, i);

                if (isBuy || isSell) {
                    const type = isBuy ? "BUY" : "SELL";
                    const spot = c.close;
                    const atrVal = atr[i] || 15;
                    const riskPts = Math.max(15, Math.min(35, atrVal * 1.5));
                    const sl = type === "BUY" ? (spot - riskPts) : (spot + riskPts);
                    const tp = type === "BUY" ? (spot + riskPts * 3.0) : (spot - riskPts * 3.0);

                    openTrade = { type, entry: spot, sl, tp, riskPts, lastTrailingR: 0 };
                }
            }
        }

        const total = wins + losses;
        const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";
        const optionRupees = (totalPnl * 0.50 * 50).toFixed(0);

        results.push({
            id: strat.id,
            name: strat.name,
            totalTrades: total,
            wins,
            losses,
            winrate: `${winrate}%`,
            spotPnlPts: Number(totalPnl.toFixed(1)),
            optionNetPnlRupees: `₹${Number(optionRupees).toLocaleString('en-IN')}`,
            big75PtPlusTrades: bigTrades
        });
    }

    console.log('🏆 TRAILING SL MULTI-YEAR HISTORICAL MINING PERFORMANCE RESULTS:');
    console.table(results);

})();
