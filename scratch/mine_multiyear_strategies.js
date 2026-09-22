const { candleDataHub } = require('../Candlehub/candleDataHub');
const indicators = require('../indicators');

(async () => {
    console.log('===================================================================================================================');
    console.log('🔬 MULTI-YEAR QUANTITATIVE STRATEGY MINER (2024 - 2026 HISTORICAL CANDLE DATASET)');
    console.log('Target: Extract empirical strategies capturing 75 to 100+ point trend moves with high winrate & PnL');
    console.log('===================================================================================================================\n');

    const startDate = '2024-01-01';
    const endDate = '2026-09-22';

    console.log(`⏳ Loading historical candle dataset (${startDate} to ${endDate})...`);
    let candles = [];
    try {
        candles = await candleDataHub.getCandles(startDate, endDate, 'NIFTY_50', '5');
    } catch (e) {
        console.error('Error fetching candles:', e.message);
    }

    if (!candles || candles.length === 0) {
        console.log('⚠️ Could not fetch from candleDataHub directly, attempting local loader...');
        const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
        candles = loadAllCandlesFromDir();
    }

    console.log(`✅ Loaded ${candles.length} historical candles.\n`);

    if (candles.length === 0) {
        console.log('❌ No candles available for mining.');
        process.exit(1);
    }

    // Compute base indicators
    console.log('⚡ Computing multi-year indicators (VWAP, Supertrend, RSI, ADX, ATR, EMA, MACD, BB, Donchian, PrevDay)...');
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

    // Build Previous Day Levels & ORB
    const orbMap = {};
    const prevDayMap = {};
    const candlesByDate = {};
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
            const high = Math.max(...prevCandles.map(c => c.high));
            const low = Math.min(...prevCandles.map(c => c.low));
            prevDayMap[currentDate] = { pdh: high, pdl: low };
        }
    }
    const wicks = candles.map(c => (indicators.priceAction && indicators.priceAction.analyzeWicks) ? indicators.priceAction.analyzeWicks(c) : null);

    // Candidate Strategy Rule sets to evaluate
    const candidateRules = [
        {
            id: "MINED_STRAT_1_SUPER_MACD_RIDER",
            name: "Mined: Supertrend + MACD Zero-Cross Rider",
            rrRatio: 2.8,
            minRvol: 1.30,
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
            id: "MINED_STRAT_2_ATR_RANGE_SPIKE",
            name: "Mined: ATR Volatility Expansion Surge",
            rrRatio: 3.0,
            minRvol: 1.40,
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
            id: "MINED_STRAT_3_PDH_PDL_BREAKOUT",
            name: "Mined: Previous Day PDH/PDL Level Breakout",
            rrRatio: 2.8,
            minRvol: 1.35,
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
            id: "MINED_STRAT_4_VWAP_PULLBACK_REENTRY",
            name: "Mined: VWAP Pullback Re-entry Trend",
            rrRatio: 2.6,
            minRvol: 1.25,
            buyFn: (c, i) => {
                const eF = emaFast[i];
                const eS = emaSlow[i];
                const w = wicks[i];
                const isLowerWick = w && (w.rejection === "BUYING_REJECTION" || w.lowerWickRatio >= 38);
                return eF && eS && eF > eS && isLowerWick && vwap[i] && c.close > vwap[i] && rsi[i] >= 52 && rvol[i] >= 1.25;
            },
            sellFn: (c, i) => {
                const eF = emaFast[i];
                const eS = emaSlow[i];
                const w = wicks[i];
                const isUpperWick = w && (w.rejection === "SELLING_REJECTION" || w.upperWickRatio >= 38);
                return eF && eS && eF < eS && isUpperWick && vwap[i] && c.close < vwap[i] && rsi[i] <= 48 && rvol[i] >= 1.25;
            }
        },
        {
            id: "MINED_STRAT_5_BOLLINGER_SQUEEZE_EXPLOSION",
            name: "Mined: Bollinger Band Squeeze Explosion",
            rrRatio: 3.0,
            minRvol: 1.40,
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
            id: "MINED_STRAT_6_HIGH_ADX_MOMENTUM_RALLIER",
            name: "Mined: High-ADX Prolonged Trend Rallier",
            rrRatio: 3.0,
            minRvol: 1.35,
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

    console.log(`📊 Evaluating ${candidateRules.length} candidate strategies across ${candles.length} candles...\n`);

    const results = [];

    for (const rule of candidateRules) {
        let openTrade = null;
        let wins = 0;
        let losses = 0;
        let totalPnlSpot = 0;
        let totalPnlOptionEst = 0;
        let totalBigTrades = 0; // Trades with > 75 pts capture

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const timeStr = c.time || '';

            // Prime Trading Window Enforcement (09:30 AM to 02:45 PM)
            const [hStr, mStr] = timeStr.split(':');
            const h = parseInt(hStr, 10);
            const m = parseInt(mStr, 10);
            const totalMins = h * 60 + m;
            const isPrimeWindow = totalMins >= (9 * 60 + 30) && totalMins <= (14 * 60 + 45);

            if (openTrade) {
                const isBuy = openTrade.type === "BUY";
                let exitPrice = null;
                let exitReason = "";

                if (isBuy) {
                    if (c.low <= openTrade.sl) { exitPrice = openTrade.sl; exitReason = "SL"; }
                    else if (c.high >= openTrade.tp) { exitPrice = openTrade.tp; exitReason = "TP"; }
                } else {
                    if (c.high >= openTrade.sl) { exitPrice = openTrade.sl; exitReason = "SL"; }
                    else if (c.low <= openTrade.tp) { exitPrice = openTrade.tp; exitReason = "TP"; }
                }

                if (!exitPrice && totalMins >= (15 * 60 + 15)) {
                    exitPrice = c.close;
                    exitReason = "EOD";
                }

                if (exitPrice) {
                    const spotPts = isBuy ? (exitPrice - openTrade.entry) : (openTrade.entry - exitPrice);
                    const optEstPts = spotPts * 0.50; // ~0.50 Delta option premium estimate
                    const optEstRupees = optEstPts * 50; // 1 Lot (50 Qty)

                    if (spotPts > 0) wins++;
                    else losses++;

                    if (Math.abs(spotPts) >= 75) totalBigTrades++;

                    totalPnlSpot += spotPts;
                    totalPnlOptionEst += optEstRupees;
                    openTrade = null;
                }
            }

            if (!openTrade && isPrimeWindow) {
                const isBuySignal = rule.buyFn(c, i);
                const isSellSignal = rule.sellFn(c, i);

                if (isBuySignal || isSellSignal) {
                    const type = isBuySignal ? "BUY" : "SELL";
                    const spotPrice = c.close;
                    const atrVal = atr[i] || 15.0;
                    const slPts = Math.max(15.0, Math.min(35.0, atrVal * 1.5));
                    const sl = type === "BUY" ? (spotPrice - slPts) : (spotPrice + slPts);
                    const tpPts = slPts * rule.rrRatio;
                    const tp = type === "BUY" ? (spotPrice + tpPts) : (spotPrice - tpPts);

                    openTrade = { type, entry: spotPrice, sl, tp, slPts, tpPts, time: timeStr, date: c.date };
                }
            }
        }

        const totalTrades = wins + losses;
        const winrate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";

        results.push({
            id: rule.id,
            name: rule.name,
            totalTrades,
            wins,
            losses,
            winrate: `${winrate}%`,
            totalPnlSpotPoints: Number(totalPnlSpot.toFixed(1)),
            totalPnlOptionRupees: `₹${Number(totalPnlOptionEst.toFixed(0)).toLocaleString('en-IN')}`,
            big75PtPlusTrades: totalBigTrades,
            rrRatio: rule.rrRatio
        });
    }

    console.log('===================================================================================================================');
    console.log('🏆 2024-2026 EMPIRICALLY MINED STRATEGY PERFORMANCE RANKINGS');
    console.log('===================================================================================================================');
    console.table(results);

})();
