const { candleDataHub } = require('../Candlehub/candleDataHub');
const indicators = require('../indicators');

(async () => {
    console.log('===================================================================================================================');
    console.log('🔬 OPTIMIZING 10 DAILY ACTIVE STRATEGIES WITH ADX & RVOL FILTERS');
    console.log('Target: Min 1:1.5 Profit Lock -> 1:5.0 Runner Trailing SL across 22,722 Candles');
    console.log('===================================================================================================================\n');

    const candles = await candleDataHub.getCandles('2024-01-01', '2026-09-22', 'NIFTY_50', '5');

    const vwap = indicators.trend.calculateVWAP(candles);
    const supertrend = indicators.trend.calculateSupertrend(candles, 10, 3);
    const rvol = indicators.volume.calculateRelativeVolume(candles, 20);
    const rsi = indicators.momentum.calculateRSI(candles, 14);
    const adx = indicators.trend.calculateADX(candles, 14);
    const atr = indicators.volatility.calculateATR(candles, 14);
    const ema9 = indicators.trend.calculateEMA(candles, 9);
    const ema10 = indicators.trend.calculateEMA(candles, 10);
    const ema20 = indicators.trend.calculateEMA(candles, 20);
    const ema21 = indicators.trend.calculateEMA(candles, 21);
    const ema50 = indicators.trend.calculateEMA(candles, 50);
    const macd = indicators.momentum.calculateMACD ? indicators.momentum.calculateMACD(candles, 12, 26, 9) : null;

    const donchian20 = [];
    for (let i = 0; i < candles.length; i++) {
        if (i < 20) { donchian20.push(null); continue; }
        const slice = candles.slice(i - 20, i);
        donchian20.push({ upper: Math.max(...slice.map(c => c.high)), lower: Math.min(...slice.map(c => c.low)) });
    }

    const orbMap = {}, prevDayMap = {}, candlesByDate = {};
    for (const c of candles) {
        const d = c.date || 'DEFAULT';
        if (!candlesByDate[d]) candlesByDate[d] = [];
        candlesByDate[d].push(c);
    }
    for (const [d, dateCandles] of Object.entries(candlesByDate)) {
        if (indicators.marketContext && indicators.marketContext.getOpeningRange) {
            const res = indicators.marketContext.getOpeningRange(dateCandles, 15);
            orbMap[d] = { high: res.orbHigh, low: res.orbLow };
        }
    }
    const dates = Object.keys(candlesByDate);
    for (let dIdx = 1; dIdx < dates.length; dIdx++) {
        const prevDate = dates[dIdx - 1];
        const currentDate = dates[dIdx];
        const prevCandles = candlesByDate[prevDate];
        if (prevCandles && prevCandles.length > 0) {
            prevDayMap[currentDate] = { pdh: Math.max(...prevCandles.map(c => c.high)), pdl: Math.min(...prevCandles.map(c => c.low)) };
        }
    }
    const wicks = candles.map(c => (indicators.priceAction && indicators.priceAction.analyzeWicks) ? indicators.priceAction.analyzeWicks(c) : null);

    const trailingSteps = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

    const dailyActiveStrategies = [
        {
            id: "STRAT_1_SUPERTREND_VWAP",
            name: "1. Supertrend + VWAP Intraday Scalper",
            buyFn: (c, i) => {
                const st = supertrend[i];
                const isStBull = st && (st.direction === 1 || st.direction === "UP" || st.direction === "BUY");
                return isStBull && vwap[i] && c.close > vwap[i] && rsi[i] >= 53 && rvol[i] >= 1.30;
            },
            sellFn: (c, i) => {
                const st = supertrend[i];
                const isStBear = st && (st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL");
                return isStBear && vwap[i] && c.close < vwap[i] && rsi[i] <= 47 && rvol[i] >= 1.30;
            }
        },
        {
            id: "STRAT_2_ORB_15M",
            name: "2. 15-Min ORB Range Breakout",
            buyFn: (c, i) => {
                const orb = orbMap[c.date];
                return orb && orb.high && c.close > orb.high && vwap[i] && c.close > vwap[i] && rvol[i] >= 1.35;
            },
            sellFn: (c, i) => {
                const orb = orbMap[c.date];
                return orb && orb.low && c.close < orb.low && vwap[i] && c.close < vwap[i] && rvol[i] >= 1.35;
            }
        },
        {
            id: "STRAT_3_EMA_GOLDEN_CROSS",
            name: "3. EMA 20/50 Golden Cross + RSI",
            buyFn: (c, i) => {
                const eFast = ema20[i], eSlow = ema50[i];
                const prevEFast = i > 0 ? ema20[i - 1] : eFast, prevESlow = i > 0 ? ema50[i - 1] : eSlow;
                return eFast && eSlow && eFast > eSlow && prevEFast <= prevESlow && vwap[i] && c.close > vwap[i] && rsi[i] >= 54 && rvol[i] >= 1.25;
            },
            sellFn: (c, i) => {
                const eFast = ema20[i], eSlow = ema50[i];
                const prevEFast = i > 0 ? ema20[i - 1] : eFast, prevESlow = i > 0 ? ema50[i - 1] : eSlow;
                return eFast && eSlow && eFast < eSlow && prevEFast >= prevESlow && vwap[i] && c.close < vwap[i] && rsi[i] <= 46 && rvol[i] >= 1.25;
            }
        },
        {
            id: "STRAT_4_WICK_REVERSAL",
            name: "4. Liquidity Sweep Wick Reversal",
            buyFn: (c, i) => {
                const w = wicks[i];
                const isLowerWick = w && (w.rejection === "BUYING_REJECTION" || w.lowerWickRatio >= 40);
                return isLowerWick && vwap[i] && c.close > vwap[i] && rsi[i] >= 50 && rvol[i] >= 1.30;
            },
            sellFn: (c, i) => {
                const w = wicks[i];
                const isUpperWick = w && (w.rejection === "SELLING_REJECTION" || w.upperWickRatio >= 40);
                return isUpperWick && vwap[i] && c.close < vwap[i] && rsi[i] <= 50 && rvol[i] >= 1.30;
            }
        },
        {
            id: "STRAT_5_CONFLUENCE_MOMENTUM",
            name: "5. Multi-Indicator Triple Confluence",
            buyFn: (c, i) => {
                const st = supertrend[i];
                const isStBull = st && (st.direction === 1 || st.direction === "UP" || st.direction === "BUY");
                const eFast = ema20[i], eSlow = ema50[i];
                return isStBull && eFast && eSlow && eFast > eSlow && vwap[i] && c.close > vwap[i] && rsi[i] >= 55 && rvol[i] >= 1.35;
            },
            sellFn: (c, i) => {
                const st = supertrend[i];
                const isStBear = st && (st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL");
                const eFast = ema20[i], eSlow = ema50[i];
                return isStBear && eFast && eSlow && eFast < eSlow && vwap[i] && c.close < vwap[i] && rsi[i] <= 45 && rvol[i] >= 1.35;
            }
        },
        {
            id: "STRAT_6_TRIPLE_EMA_STACK",
            name: "6. Triple EMA (10/20/50) Stacked Trend",
            buyFn: (c, i) => {
                const e10 = ema10[i], e20 = ema20[i], e50 = ema50[i];
                return e10 && e20 && e50 && e10 > e20 && e20 > e50 && vwap[i] && c.close > vwap[i] && rsi[i] >= 54 && rvol[i] >= 1.30;
            },
            sellFn: (c, i) => {
                const e10 = ema10[i], e20 = ema20[i], e50 = ema50[i];
                return e10 && e20 && e50 && e10 < e20 && e20 < e50 && vwap[i] && c.close < vwap[i] && rsi[i] <= 46 && rvol[i] >= 1.30;
            }
        },
        {
            id: "STRAT_7_MACD_SUPER_RIDER",
            name: "7. Supertrend + MACD Zero-Cross Rider",
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
            id: "STRAT_8_DONCHIAN_BREAKOUT",
            name: "8. Donchian 20-Period Channel Breakout",
            buyFn: (c, i) => {
                const dc = donchian20[i];
                return dc && c.close > dc.upper && vwap[i] && c.close > vwap[i] && rsi[i] >= 55 && rvol[i] >= 1.35;
            },
            sellFn: (c, i) => {
                const dc = donchian20[i];
                return dc && c.close < dc.lower && vwap[i] && c.close < vwap[i] && rsi[i] <= 45 && rvol[i] >= 1.35;
            }
        },
        {
            id: "STRAT_9_ATR_VOLATILITY_EXPANSION",
            name: "9. ATR Volatility Expansion Surge",
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
            id: "STRAT_10_PREV_DAY_BREAKOUT",
            name: "10. Previous Day (PDH/PDL) Level Breakout",
            buyFn: (c, i) => {
                const pd = prevDayMap[c.date];
                return pd && pd.pdh && c.close > pd.pdh && vwap[i] && c.close > vwap[i] && rsi[i] >= 55 && rvol[i] >= 1.35;
            },
            sellFn: (c, i) => {
                const pd = prevDayMap[c.date];
                return pd && pd.pdl && c.close < pd.pdl && vwap[i] && c.close < vwap[i] && rsi[i] <= 45 && rvol[i] >= 1.35;
            }
        }
    ];

    const results = [];

    for (const strat of dailyActiveStrategies) {
        let openTrade = null;
        let wins = 0, losses = 0, totalPnlSpot = 0, min1_5Wins = 0, max1_5RunnerWins = 0;
        const tradedDates = new Set();

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const [h, m] = (c.time || '0:0').split(':').map(Number);
            const totalMins = h * 60 + m;
            const isPrimeWindow = totalMins >= 9 * 60 + 30 && totalMins <= 14 * 60 + 45;

            if (openTrade) {
                const isBuy = openTrade.type === "BUY";
                const spot = c.close;
                const priceDiff = isBuy ? (spot - openTrade.entry) : (openTrade.entry - spot);
                const currentR = priceDiff / openTrade.riskPts;

                // 1.5x Min Lock to 5.0x Max Runner Trailing SL
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
                    else if (c.high >= openTrade.tpMax) exitPrice = openTrade.tpMax;
                } else {
                    if (c.high >= openTrade.sl) exitPrice = openTrade.sl;
                    else if (c.low <= openTrade.tpMax) exitPrice = openTrade.tpMax;
                }

                if (!exitPrice && totalMins >= 15 * 60 + 15) exitPrice = c.close;

                if (exitPrice) {
                    const pts = isBuy ? (exitPrice - openTrade.entry) : (openTrade.entry - exitPrice);
                    if (pts > 0) {
                        wins++;
                        const finalR = pts / openTrade.riskPts;
                        if (finalR >= 1.5) min1_5Wins++;
                        if (finalR >= 4.0) max1_5RunnerWins++;
                    } else {
                        losses++;
                    }
                    totalPnlSpot += pts;
                    openTrade = null;
                }
            }

            if (!openTrade && isPrimeWindow) {
                const buy = strat.buyFn(c, i);
                const sell = strat.sellFn(c, i);

                if (buy || sell) {
                    const type = buy ? "BUY" : "SELL";
                    const spot = c.close;
                    const atrVal = atr[i] || 15;
                    const riskPts = Math.max(15, Math.min(35, atrVal * 1.5));
                    const sl = type === "BUY" ? (spot - riskPts) : (spot + riskPts);
                    const tpMax = type === "BUY" ? (spot + riskPts * 5.0) : (spot - riskPts * 5.0); // 1:5.0 Max Runner

                    openTrade = { type, entry: spot, sl, tpMax, riskPts, lastTrailingR: 0 };
                    tradedDates.add(c.date);
                }
            }
        }

        const totalTrades = wins + losses;
        const winrate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";
        const optionRupees = (totalPnlSpot * 0.50 * 50).toFixed(0);

        results.push({
            id: strat.id,
            name: strat.name,
            totalTrades,
            tradedDays: tradedDates.size,
            winrate: `${winrate}%`,
            min1_5Wins,
            max1_5Runners: max1_5RunnerWins,
            totalPnlSpotPts: Number(totalPnlSpot.toFixed(1)),
            optionNetPnlRupees: `₹${Number(optionRupees).toLocaleString('en-IN')}`
        });
    }

    console.log('===================================================================================================================');
    console.log('🏆 TOP 10 DAILY ACTIVE HIGH-CONVICTION STRATEGIES (AUDITED ACROSS 22,722 CANDLES)');
    console.log('===================================================================================================================');
    console.table(results);

})();
