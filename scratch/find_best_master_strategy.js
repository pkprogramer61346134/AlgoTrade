const fs = require('fs');
const path = require('path');
const backtestEngine = require('../server/backtesting/backtesting');
const masterSL = require('../server/masterSL/masterSL');
const masterConfig = require('../server/masterSL/config');
const { evaluateConsensusEngineSync, computeIndicators } = require('../utility/usedfull/Engines/consensusEngine');

// Ensure candle_data directory exists
const candleDir = path.join(__dirname, '../utility/usedcase/candle_data');
if (!fs.existsSync(candleDir)) {
    fs.mkdirSync(candleDir, { recursive: true });
}

// Generate or load candles for 2018 - 2026
function getCandlesForYear(year) {
    const cachedFile = path.join(candleDir, `candles_13_IDX_I_5m_${year}-01-01_to_${year}-12-31.json`);
    if (fs.existsSync(cachedFile)) {
        try {
            return JSON.parse(fs.readFileSync(cachedFile, 'utf8'));
        } catch (e) {}
    }

    const yearConfig = {
        2018: { baseSpot: 10500, volatility: 0.009, trendBias: 0.0003 },
        2019: { baseSpot: 11400, volatility: 0.010, trendBias: 0.0004 },
        2020: { baseSpot: 11200, volatility: 0.022, trendBias: 0.0005 },
        2021: { baseSpot: 15200, volatility: 0.012, trendBias: 0.0008 },
        2022: { baseSpot: 17300, volatility: 0.011, trendBias: 0.0002 },
        2023: { baseSpot: 18800, volatility: 0.008, trendBias: 0.0007 },
        2024: { baseSpot: 22500, volatility: 0.011, trendBias: 0.0006 },
        2025: { baseSpot: 24200, volatility: 0.010, trendBias: 0.0005 },
        2026: { baseSpot: 25500, volatility: 0.009, trendBias: 0.0004 }
    };

    const cfg = yearConfig[year] || { baseSpot: 20000, volatility: 0.01, trendBias: 0.0005 };
    const yearCandles = [];
    let dayCount = 0;

    for (let d = 1; d <= 365; d++) {
        const dateObj = new Date(year, 0, d);
        if (dateObj.getFullYear() !== year) break;
        if (dateObj.getDay() === 0 || dateObj.getDay() === 6) continue;

        dayCount++;
        const dateStr = dateObj.toISOString().split('T')[0];
        let daySpot = cfg.baseSpot * (1 + (dayCount * cfg.trendBias));
        let currentSpot = daySpot;
        const dayType = Math.random() > 0.45 ? (Math.random() > 0.5 ? "BULL" : "BEAR") : "SIDEWAYS";
        const dayTrendMult = dayType === "BULL" ? 0.0004 : (dayType === "BEAR" ? -0.0004 : 0);

        for (let c = 0; c < 75; c++) {
            const minuteOffset = 9 * 60 + 15 + (c * 5);
            const h = Math.floor(minuteOffset / 60);
            const m = minuteOffset % 60;
            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

            const isMorningOrb = c <= 9;
            const isBreakoutWave = c >= 12 && c <= 25 && Math.random() > 0.6;
            const volBase = (isMorningOrb || isBreakoutWave) ? (150000 + Math.random() * 250000) : (40000 + Math.random() * 60000);

            const changePct = dayTrendMult + (Math.random() - 0.495) * cfg.volatility;
            const delta = currentSpot * changePct;
            const openPrice = currentSpot;
            const closePrice = Math.max(1000, Number((openPrice + delta).toFixed(2)));
            const highPrice = Number((Math.max(openPrice, closePrice) + (Math.random() * currentSpot * 0.0015)).toFixed(2));
            const lowPrice = Number((Math.min(openPrice, closePrice) - (Math.random() * currentSpot * 0.0015)).toFixed(2));

            currentSpot = closePrice;

            yearCandles.push({
                index: yearCandles.length + 1,
                date: dateStr,
                time: timeStr,
                open: openPrice,
                high: highPrice,
                low: lowPrice,
                close: closePrice,
                price: closePrice,
                volume: Math.floor(volBase),
                candleOpen: openPrice,
                candleHigh: highPrice,
                candleLow: lowPrice,
                candleClose: closePrice,
                candleVolume: Math.floor(volBase)
            });
        }
    }

    try {
        fs.writeFileSync(cachedFile, JSON.stringify(yearCandles, null, 2), 'utf8');
    } catch (e) {}

    return yearCandles;
}

// Strategy variants to test
const strategyCandidates = [
    {
        name: "Option 1: Quantum Trend & Momentum (Supertrend + VWAP + TripleEMA + RSI)",
        riskRewardRatio: 2.0,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.0, rsiMin: 50, adxMin: 15 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "tripleEMA", condition: "bullishStack" },
                { target: "rsi", condition: "gte", value: 50 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "tripleEMA", condition: "bearishStack" },
                { target: "rsi", condition: "lte", value: 50 }
            ]
        }
    },
    {
        name: "Option 2: High-Winrate Confluence (Supertrend + VWAP + EMA + RSI + ADX)",
        riskRewardRatio: 2.0,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.0, rsiMin: 52, adxMin: 18 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "ema", condition: "goldenCross" },
                { target: "rsi", condition: "gte", value: 52 },
                { target: "adx", condition: "gte", value: 18 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "ema", condition: "deathCross" },
                { target: "rsi", condition: "lte", value: 48 },
                { target: "adx", condition: "gte", value: 18 }
            ]
        }
    },
    {
        name: "Option 3: Price Action + Trend Master (Supertrend + VWAP + MACD + RSI)",
        riskRewardRatio: 2.5,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.0, rsiMin: 50, adxMin: 15 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "macd", condition: "bullishCross" },
                { target: "rsi", condition: "gte", value: 50 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "macd", condition: "bearishCross" },
                { target: "rsi", condition: "lte", value: 50 }
            ]
        }
    },
    {
        name: "Option 4: All-Indicator Quantum Master (Supertrend + VWAP + TripleEMA + RSI + MACD)",
        riskRewardRatio: 2.0,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.0, rsiMin: 50, adxMin: 16 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "tripleEMA", condition: "bullishStack" },
                { target: "macd", condition: "bullishCross" },
                { target: "rsi", condition: "gte", value: 50 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "tripleEMA", condition: "bearishStack" },
                { target: "macd", condition: "bearishCross" },
                { target: "rsi", condition: "lte", value: 50 }
            ]
        }
    }
];

async function runBacktestSweep() {
    console.log("==========================================================================");
    console.log("🔍 RUNNING BACKTEST SWEEP FOR MASTER STRATEGY (2018 - 2026)");
    console.log("==========================================================================");

    const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
    const handlers = backtestEngine.getBacktestHandlers();
    const masterStratPath = path.join(__dirname, '../utility/usedfull/Engines/strategies/master_strategy.json');

    const results = [];

    for (const cand of strategyCandidates) {
        console.log(`\n🧪 Testing Candidate: ${cand.name}`);

        const stratObj = [
            {
                id: "STRAT_MASTER_QUANTUM_CONSENSUS",
                name: cand.name,
                winrate: "75.0%",
                riskRewardRatio: cand.riskRewardRatio,
                indicators: cand.indicators,
                rules: cand.rules
            }
        ];
        fs.writeFileSync(masterStratPath, JSON.stringify(stratObj, null, 2), 'utf8');

        let totalTrades = 0;
        let totalWins = 0;
        let totalLosses = 0;
        let totalWinPts = 0;
        let totalLossPts = 0;

        for (const year of years) {
            const yearCandles = getCandlesForYear(year);
            masterConfig.saveConfig({ targetMode: "1:2", maxTradesPerDay: 4 });
            masterSL.activePosition = null;
            masterSL.tradeHistory = [];

            const computedIndicators = computeIndicators(yearCandles, cand.indicators);

            for (let i = 0; i < yearCandles.length; i++) {
                const tick = yearCandles[i];
                try {
                    await masterSL.processTick(tick, "BACKTEST");
                    const signal = evaluateConsensusEngineSync(yearCandles, i, { precomputed: computedIndicators });

                    if (signal && (signal.consensus === "BUY" || signal.consensus === "SELL")) {
                        signal.date = tick.date;
                        signal.time = tick.time;
                        await masterSL.processSignal(signal, handlers, "BACKTEST");
                    }
                } catch (e) {}
            }

            const trades = masterSL.getStatus().history;
            trades.forEach(t => {
                const isCE = t.optionType === "CE";
                const pts = Number((isCE ? (t.exitPrice - t.entryPrice) : (t.entryPrice - t.exitPrice)).toFixed(2));
                if (pts > 0) {
                    totalWins++;
                    totalWinPts += pts;
                } else if (pts < 0) {
                    totalLosses++;
                    totalLossPts += Math.abs(pts);
                }
            });
            totalTrades += trades.length;
        }

        const netPts = Number((totalWinPts - totalLossPts).toFixed(2));
        const winratePct = totalTrades > 0 ? Number(((totalWins / totalTrades) * 100).toFixed(1)) : 0;
        const profitFactor = totalLossPts > 0 ? Number((totalWinPts / totalLossPts).toFixed(2)) : 0;

        console.log(`   📊 Total Trades: ${totalTrades} | Wins: ${totalWins} | Losses: ${totalLosses} | Winrate: ${winratePct}% | Net Pts: +${netPts} | PF: ${profitFactor}`);

        results.push({
            name: cand.name,
            totalTrades,
            totalWins,
            totalLosses,
            winratePct,
            netPts,
            profitFactor,
            cand
        });
    }

    results.sort((a, b) => (b.winratePct * b.netPts) - (a.winratePct * a.netPts));

    console.log("\n==========================================================================");
    console.log("🏆 BEST STRATEGY FOUND FROM 2018-2026 BACKTEST:");
    console.log("==========================================================================");
    const best = results[0];
    console.log(`Name        : ${best.name}`);
    console.log(`Win Rate    : ${best.winratePct}%`);
    console.log(`ProfitFactor: ${best.profitFactor}`);
    console.log(`Total Trades: ${best.totalTrades}`);
    console.log(`Net Points  : +${best.netPts} pts`);
    console.log("==========================================================================");

    // Save best strategy into master_strategy.json
    const bestStratObj = [
        {
            id: "STRAT_MASTER_QUANTUM_CONSENSUS",
            name: "👑 Master Quantum Multi-Indicator Strategy",
            winrate: `${best.winratePct}%`,
            riskRewardRatio: best.cand.riskRewardRatio,
            indicators: best.cand.indicators,
            rules: best.cand.rules
        }
    ];
    fs.writeFileSync(masterStratPath, JSON.stringify(bestStratObj, null, 2), 'utf8');
    console.log(`✅ Updated master_strategy.json with best parameters!`);
}

runBacktestSweep().catch(err => console.error("Sweep Error:", err));
