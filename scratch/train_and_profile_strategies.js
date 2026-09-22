/**
 * Strategy Profiler & Multi-Strategy Library Generator (2023 - 2025 Training)
 * With ADX Market Regime Filtering (ADX >= 20) & Confluence Rules
 */

const fs = require('fs');
const path = require('path');
const indicators = require('../indicators');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

const candleDir = path.join(__dirname, '../candle_data');
const files = fs.readdirSync(candleDir).filter(f => {
    return f.endsWith('.json') && (f.includes('2023') || f.includes('2024') || f.includes('2025'));
});

let allCandles = [];
files.forEach(f => {
    try {
        const filePath = path.join(candleDir, f);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Array.isArray(data)) {
            allCandles = allCandles.concat(data);
        }
    } catch (e) {}
});

allCandles.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.time || '').localeCompare(b.time || '');
});

// Precalculate Indicators
const ema20 = indicators.trend.calculateEMA(allCandles, 20);
const ema50 = indicators.trend.calculateEMA(allCandles, 50);
const vwap = indicators.trend.calculateVWAP(allCandles);
const supertrend = indicators.trend.calculateSupertrend(allCandles, 10, 3);
const rvol = indicators.volume.calculateRelativeVolume(allCandles, 20);
const rsi = indicators.momentum.calculateRSI(allCandles, 14);
const atr = indicators.volatility.calculateATR(allCandles, 14);
const adx = indicators.trend.calculateADX(allCandles, 14);

const dayORB = {};
for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (!c.date) continue;
    if (!dayORB[c.date]) dayORB[c.date] = { high: -Infinity, low: Infinity, count: 0 };
    if (dayORB[c.date].count < 3) {
        if (c.high > dayORB[c.date].high) dayORB[c.date].high = c.high;
        if (c.low < dayORB[c.date].low) dayORB[c.date].low = c.low;
        dayORB[c.date].count++;
    }
}

// High Conviction Strategy Setups with ADX Regime Filter (ADX >= 20)
const strategyDefinitions = [
    {
        id: "STRAT_1_SUPERTREND_VWAP_RVOL_ADX",
        name: "Supertrend + VWAP + RVOL (ADX Trending Regime)",
        category: "Institutional Trend Breakout",
        evaluator: (c, i) => {
            const adxVal = adx[i] ? adx[i].adx : 0;
            if (adxVal < 20) return "NONE"; // Skip sideways chop
            const st = supertrend[i];
            const v = vwap[i];
            const r = rvol[i] || 1.0;
            if (!st || v === null) return "NONE";
            const isStBull = st.direction === 1 || st.direction === "UP" || st.direction === "BUY";
            const isStBear = st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL";
            if (isStBull && c.close > v && r >= 1.25) return "BUY";
            if (isStBear && c.close < v && r >= 1.25) return "SELL";
            return "NONE";
        }
    },
    {
        id: "STRAT_2_ORB_TREND_CONFLUENCE",
        name: "15-Min ORB + Supertrend + ADX Regime",
        category: "Opening Range Trend",
        evaluator: (c, i) => {
            const adxVal = adx[i] ? adx[i].adx : 0;
            if (adxVal < 22) return "NONE";
            const orb = dayORB[c.date];
            const st = supertrend[i];
            const r = rvol[i] || 1.0;
            if (!orb || orb.high === -Infinity || !st) return "NONE";
            const isStBull = st.direction === 1 || st.direction === "UP" || st.direction === "BUY";
            const isStBear = st.direction === -1 || st.direction === "DOWN" || st.direction === "SELL";
            if (c.close > orb.high && isStBull && r >= 1.25) return "BUY";
            if (c.close < orb.low && isStBear && r >= 1.25) return "SELL";
            return "NONE";
        }
    },
    {
        id: "STRAT_3_WICK_REJECTION_REVERSAL",
        name: "Upper/Lower Wick Rejection + VWAP Reversal",
        category: "Price Action Reversal",
        evaluator: (c, i) => {
            const v = vwap[i];
            const r = rvol[i] || 1.0;
            if (v === null) return "NONE";
            const range = c.high - c.low;
            if (range <= 0) return "NONE";
            const upperWick = c.high - Math.max(c.open, c.close);
            const lowerWick = Math.min(c.open, c.close) - c.low;
            const isLowerWickRej = (lowerWick / range) >= 0.40;
            const isUpperWickRej = (upperWick / range) >= 0.40;
            if (isLowerWickRej && c.close > v && r >= 1.30) return "BUY";
            if (isUpperWickRej && c.close < v && r >= 1.30) return "SELL";
            return "NONE";
        }
    },
    {
        id: "STRAT_4_EMA_20_50_CROSSOVER_ADX",
        name: "EMA 20/50 Golden Cross + ADX Trend Confirmation",
        category: "Moving Average Cross",
        evaluator: (c, i) => {
            const adxVal = adx[i] ? adx[i].adx : 0;
            if (adxVal < 22) return "NONE";
            const e20 = ema20[i];
            const e50 = ema50[i];
            const v = vwap[i];
            const r = rvol[i] || 1.0;
            if (e20 === null || e50 === null || v === null) return "NONE";
            if (e20 > e50 && c.close > v && r >= 1.25) return "BUY";
            if (e20 < e50 && c.close < v && r >= 1.25) return "SELL";
            return "NONE";
        }
    },
    {
        id: "STRAT_5_RSI_SURGE_VWAP",
        name: "RSI Momentum Surge (RSI > 58 / < 42) + VWAP",
        category: "RSI Momentum",
        evaluator: (c, i) => {
            const rsiVal = rsi[i];
            const v = vwap[i];
            const r = rvol[i] || 1.0;
            if (rsiVal === null || v === null) return "NONE";
            if (rsiVal > 58 && c.close > v && r >= 1.30) return "BUY";
            if (rsiVal < 42 && c.close < v && r >= 1.30) return "SELL";
            return "NONE";
        }
    }
];

const scorecard = [];

strategyDefinitions.forEach(strat => {
    let runningCapital = 100000;
    const initialCapital = 100000;
    let activeTrade = null;
    const completedTrades = [];
    const dailyTradeCounts = {};

    for (let i = 0; i < allCandles.length; i++) {
        const c = allCandles[i];
        if (!c.time) continue;

        const parts = c.time.split(':').map(Number);
        const mins = parts[0] * 60 + parts[1];
        if (mins < 570 || mins >= 870) continue;

        if (activeTrade) {
            const currentPrem = activeTrade.optionType === "CE" 
                ? activeTrade.optionPremiumPrice + (c.close - activeTrade.spotEntryPrice) * 0.5
                : activeTrade.optionPremiumPrice + (activeTrade.spotEntryPrice - c.close) * 0.5;

            const isCEHitSL = activeTrade.optionType === "CE" && c.low <= activeTrade.spotSL;
            const isCEHitTP = activeTrade.optionType === "CE" && c.high >= activeTrade.spotTarget;
            const isPEHitSL = activeTrade.optionType === "PE" && c.high >= activeTrade.spotSL;
            const isPEHitTP = activeTrade.optionType === "PE" && c.low <= activeTrade.spotTarget;

            let exitReason = null;
            let exitPrice = c.close;
            let exitPremium = currentPrem;

            if (isCEHitSL || isPEHitSL) {
                exitReason = "SL HIT";
                exitPrice = activeTrade.spotSL;
                exitPremium = activeTrade.optionSL;
            } else if (isCEHitTP || isPEHitTP) {
                exitReason = "TARGET HIT";
                exitPrice = activeTrade.spotTarget;
                exitPremium = activeTrade.target;
            } else if (c.time >= "15:00") {
                exitReason = "3:00 PM EOD";
                exitPrice = c.close;
                exitPremium = currentPrem;
            }

            if (exitReason) {
                const ptsPnl = Number((exitPremium - activeTrade.optionPremiumPrice).toFixed(2));
                const rupeePnl = Number((ptsPnl * activeTrade.quantity).toFixed(2));
                runningCapital += rupeePnl;

                completedTrades.push({
                    rupeePnl,
                    ptsPnl,
                    isWin: rupeePnl >= 0
                });
                activeTrade = null;
            }
        }

        if ((dailyTradeCounts[c.date] || 0) >= 2) continue;

        const signal = strat.evaluator(c, i);

        if (signal !== "NONE" && !activeTrade) {
            const optionType = signal === "BUY" ? "CE" : "PE";
            const spotPrice = c.close;
            const atrVal = atr[i] || 15.0;
            const NIFTY_LOT_SIZE = 65;
            const estPremium = Math.max(80, Math.min(250, spotPrice * 0.005));
            const numLots = Math.max(1, Math.floor(runningCapital / (estPremium * NIFTY_LOT_SIZE)));
            const qty = numLots * NIFTY_LOT_SIZE;

            const dynamicSLPoints = Math.max(15.0, Math.min(35.0, atrVal * 1.5));
            let sl = signal === "BUY" ? (spotPrice - dynamicSLPoints) : (spotPrice + dynamicSLPoints);
            const risk = Math.abs(spotPrice - sl);
            const dynamicTRPoints = risk * 2.0;
            let tp = signal === "BUY" ? (spotPrice + dynamicTRPoints) : (spotPrice - dynamicTRPoints);

            const spotStruct = { spotSL: sl, spotTarget: tp };
            const deltaMap = SpotRiskDeltaCalculator.mapSpotToOptionDelta({
                spotPrice,
                spotSL: spotStruct.spotSL,
                spotTarget: spotStruct.spotTarget,
                optionPremiumPrice: estPremium,
                optionType,
                delta: 0.50
            });

            activeTrade = {
                entryTime: c.time,
                optionType,
                spotEntryPrice: spotPrice,
                spotSL: spotStruct.spotSL,
                spotTarget: spotStruct.spotTarget,
                optionPremiumPrice: Number(estPremium.toFixed(2)),
                optionSL: Number(deltaMap.optionSL.toFixed(2)),
                target: Number(deltaMap.optionTarget.toFixed(2)),
                quantity: qty
            };

            dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;
        }
    }

    const totalTrades = completedTrades.length;
    const wins = completedTrades.filter(t => t.isWin).length;
    const winRate = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : 0;
    const grossProfit = completedTrades.filter(t => t.rupeePnl > 0).reduce((a, b) => a + b.rupeePnl, 0);
    const grossLoss = Math.abs(completedTrades.filter(t => t.rupeePnl < 0).reduce((a, b) => a + b.rupeePnl, 0));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.0 : 0;
    const netPnL = Number((runningCapital - initialCapital).toFixed(2));

    scorecard.push({
        id: strat.id,
        name: strat.name,
        category: strat.category,
        totalTrades,
        wins,
        losses: totalTrades - wins,
        winRate,
        profitFactor,
        netPnL,
        status: winRate >= 50.0 ? "APPROVED (HIGH WIN-RATE)" : "REJECTED"
    });
});

console.log("\n=========================================================================================");
console.log("📊 STRATEGY PROFILING WITH ADX REGIME & CONFLUENCE FILTERS (2023-2025)");
console.log("=========================================================================================\n");

console.table(scorecard.map(s => ({
    "ID": s.id,
    "Strategy Name": s.name,
    "Category": s.category,
    "Trades": s.totalTrades,
    "Win Rate (%)": `${s.winRate}%`,
    "Profit Factor": s.profitFactor,
    "Net PnL (₹)": `${s.netPnL >= 0 ? '+' : ''}₹${s.netPnL.toLocaleString()}`,
    "Status": s.status
})));

const scorecardPath = path.join(__dirname, '../strategies_config/multi_strategy_scorecard.json');
fs.writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2), 'utf8');
console.log(`\n✅ Saved Strategy Win-Rate Scorecard to: ${scorecardPath}`);
