/**
 * Find Balanced High-Frequency + Anti-Chop 15m Strategy
 * Target: 15-30 Trades / Month with High Winrate (50%+) & Net Positive Points (+100+ pts)
 */

const fs = require('fs');
const path = require('path');
const { getCachedCandles } = require('../utility/usedfull/cached-historical-data');
const { evaluateConsensusEngineSync, computeIndicators } = require('../utility/usedfull/Engines/consensusEngine');

const masterStratPath = path.join(__dirname, '../utility/usedfull/Engines/strategies/master_strategy.json');

const candidates = [
    {
        id: "BALANCED_ADX_16",
        name: "🎯 Balanced Trend Master (ADX >= 16 + Supertrend + VWAP + RSI)",
        riskRewardRatio: 2.0,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.0, rsiMin: 50, adxMin: 16 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "adx", condition: "gte", value: 16 },
                { target: "rsi", condition: "gte", value: 50 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "adx", condition: "gte", value: 16 },
                { target: "rsi", condition: "lte", value: 50 }
            ]
        }
    },
    {
        id: "BALANCED_DONCHIAN_10",
        name: "⚡ Balanced Donchian-10 Breakout (Faster Channel)",
        riskRewardRatio: 2.0,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, donchianPeriod: 10, rvolMin: 1.0, rsiMin: 50, adxMin: 15 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "donchian", condition: "upperBreak" },
                { target: "rsi", condition: "gte", value: 50 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "donchian", condition: "lowerBreak" },
                { target: "rsi", condition: "lte", value: 50 }
            ]
        }
    },
    {
        id: "BALANCED_MACD_RSI",
        name: "🔥 Balanced MACD + Supertrend + VWAP Confluence",
        riskRewardRatio: 2.0,
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
        id: "BALANCED_EMA_CROSS",
        name: "🚀 Balanced EMA Cross + Supertrend + VWAP",
        riskRewardRatio: 2.0,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.0, rsiMin: 50, adxMin: 15 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "ema", condition: "goldenCross" },
                { target: "rsi", condition: "gte", value: 50 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "ema", condition: "deathCross" },
                { target: "rsi", condition: "lte", value: 50 }
            ]
        }
    }
];

async function findBalancedStrategy() {
    console.log("==========================================================================");
    console.log("🔍 FINDING BALANCED HIGH-FREQUENCY + PROFITABLE 15M STRATEGY");
    console.log(" Target: 15-25 Trades/Month | Winrate >= 50% | Net Points > +100");
    console.log("==========================================================================");

    const candleRes = await getCachedCandles({
        securityId: "13",
        exchangeSegment: "IDX_I",
        instrument: "INDEX",
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
        interval: "15"
    });

    const candles = candleRes.data || [];
    const engine = require('../server/backtesting/backtesting');
    const results = [];

    for (const cand of candidates) {
        const stratArr = [
            {
                id: cand.id,
                name: cand.name,
                winrate: "70.0%",
                riskRewardRatio: cand.riskRewardRatio,
                indicators: cand.indicators,
                rules: cand.rules
            }
        ];
        fs.writeFileSync(masterStratPath, JSON.stringify(stratArr, null, 2), 'utf8');

        const res = await engine.streamHistoricalCandles({
            fromDate: "2026-09-01",
            toDate: "2026-09-30",
            interval: "15"
        });

        const stats = res.report.stats;
        console.log(`🧪 Candidate: ${cand.name}`);
        console.log(`   Trades: ${stats.totalTrades} | Wins: ${stats.winningTrades} | Losses: ${stats.losingTrades} | Winrate: ${stats.winrate} | Net Pts: ${stats.netPoints >= 0 ? '+' : ''}${stats.netPoints} pts | PF: ${stats.profitFactor}`);

        results.push({
            cand,
            stats,
            report: res.report
        });
    }

    // Sort by Net Points (descending)
    results.sort((a, b) => b.stats.netPoints - a.stats.netPoints);

    const best = results[0];
    console.log("\n==========================================================================");
    console.log("🏆 WINNING BALANCED STRATEGY:");
    console.log("==========================================================================");
    console.log(` Strategy Name : ${best.cand.name}`);
    console.log(` Total Trades  : ${best.stats.totalTrades}`);
    console.log(` Winning Trades: ${best.stats.winningTrades} PASS 🟢`);
    console.log(` Losing Trades : ${best.stats.losingTrades} LOSS 🔴`);
    console.log(` Win Rate      : ${best.stats.winrate}`);
    console.log(` Net Points    : ${best.stats.netPoints >= 0 ? '+' : ''}${best.stats.netPoints} pts`);
    console.log(` Profit Factor : ${best.stats.profitFactor}`);
    console.log("==========================================================================");

    const bestStratObj = [
        {
            id: best.cand.id,
            name: best.cand.name,
            winrate: best.stats.winrate,
            riskRewardRatio: best.cand.riskRewardRatio,
            indicators: best.cand.indicators,
            rules: best.cand.rules
        }
    ];

    fs.writeFileSync(masterStratPath, JSON.stringify(bestStratObj, null, 2), 'utf8');
    console.log(`\n✅ Updated master_strategy.json with the WINNING Balanced Strategy!`);
}

findBalancedStrategy().catch(err => console.error("Error:", err));
