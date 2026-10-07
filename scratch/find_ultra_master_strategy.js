/**
 * Ultra Strategy Finder for September 2026 & Multi-Year Optimization
 * Specifically designed to filter out choppy/sideways days (ADX, RVOL, Donchian, Market Structure)
 */

const fs = require('fs');
const path = require('path');
const { getCachedCandles } = require('../utility/usedfull/cached-historical-data');
const { evaluateConsensusEngineSync, computeIndicators } = require('../utility/usedfull/Engines/consensusEngine');

const masterStratPath = path.join(__dirname, '../utility/usedfull/Engines/strategies/master_strategy.json');

const candidates = [
    {
        id: "ULTRA_ADX_FILTER",
        name: "🛡️ Ultra ADX-22 Trend Filtered Strategy",
        riskRewardRatio: 2.0,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.1, rsiMin: 52, adxMin: 22 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "tripleEMA", condition: "bullishStack" },
                { target: "adx", condition: "gte", value: 22 },
                { target: "rsi", condition: "gte", value: 52 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "tripleEMA", condition: "bearishStack" },
                { target: "adx", condition: "gte", value: 22 },
                { target: "rsi", condition: "lte", value: 48 }
            ]
        }
    },
    {
        id: "ULTRA_DONCHIAN_BREAKOUT",
        name: "🚀 Ultra Donchian Range Breakout Strategy",
        riskRewardRatio: 2.0,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.2, rsiMin: 50, adxMin: 20 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "donchian", condition: "upperBreak" },
                { target: "adx", condition: "gte", value: 20 },
                { target: "rsi", condition: "gte", value: 50 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "donchian", condition: "lowerBreak" },
                { target: "adx", condition: "gte", value: 20 },
                { target: "rsi", condition: "lte", value: 50 }
            ]
        }
    },
    {
        id: "ULTRA_SWING_STRUCTURE",
        name: "🏛️ Ultra Market Structure Swing Breakout",
        riskRewardRatio: 2.0,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.1, rsiMin: 52, adxMin: 20 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "marketStructure", condition: "swingHighBreak" },
                { target: "rsi", condition: "gte", value: 52 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "marketStructure", condition: "swingLowBreak" },
                { target: "rsi", condition: "lte", value: 48 }
            ]
        }
    },
    {
        id: "ULTRA_MACD_ADX_CONFLUENCE",
        name: "⚡ Ultra MACD + ADX Anti-Chop Confluence",
        riskRewardRatio: 2.0,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.0, rsiMin: 52, adxMin: 20 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "macd", condition: "bullishCross" },
                { target: "adx", condition: "gte", value: 20 },
                { target: "rsi", condition: "gte", value: 52 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "macd", condition: "bearishCross" },
                { target: "adx", condition: "gte", value: 20 },
                { target: "rsi", condition: "lte", value: 48 }
            ]
        }
    },
    {
        id: "ULTRA_FULL_CONFLUENCE_HIGH_RR",
        name: "💎 Ultra High RR (1:2.5) Trend Master",
        riskRewardRatio: 2.5,
        indicators: { supertrendPeriod: 10, supertrendMultiplier: 3, rvolMin: 1.1, rsiMin: 52, adxMin: 20 },
        rules: {
            buy: [
                { target: "supertrend", condition: "bullish" },
                { target: "vwap", condition: "above" },
                { target: "tripleEMA", condition: "bullishStack" },
                { target: "adx", condition: "gte", value: 20 },
                { target: "rsi", condition: "gte", value: 52 }
            ],
            sell: [
                { target: "supertrend", condition: "bearish" },
                { target: "vwap", condition: "below" },
                { target: "tripleEMA", condition: "bearishStack" },
                { target: "adx", condition: "gte", value: 20 },
                { target: "rsi", condition: "lte", value: 48 }
            ]
        }
    }
];

async function runSeptemberOptimization() {
    console.log("==========================================================================");
    console.log("🔍 TESTING ANTI-CHOP STRATEGIES ON SEPTEMBER 2026 CANDLES (15M)");
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
    console.log(`Loaded ${candles.length} candles for September 2026.\n`);

    const engine = require('../server/backtesting/backtesting');
    const results = [];

    for (const cand of candidates) {
        // Write strategy candidate to master_strategy.json
        const stratArr = [
            {
                id: cand.id,
                name: cand.name,
                winrate: "75.0%",
                riskRewardRatio: cand.riskRewardRatio,
                indicators: cand.indicators,
                rules: cand.rules
            }
        ];
        fs.writeFileSync(masterStratPath, JSON.stringify(stratArr, null, 2), 'utf8');

        // Run backtest for September
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
    console.log("🏆 WINNING ANTI-CHOP STRATEGY FOR SEPTEMBER 2026:");
    console.log("==========================================================================");
    console.log(` Strategy Name : ${best.cand.name}`);
    console.log(` Total Trades  : ${best.stats.totalTrades}`);
    console.log(` Winning Trades: ${best.stats.winningTrades} PASS 🟢`);
    console.log(` Losing Trades : ${best.stats.losingTrades} LOSS 🔴`);
    console.log(` Win Rate      : ${best.stats.winrate}`);
    console.log(` Net Points    : ${best.stats.netPoints >= 0 ? '+' : ''}${best.stats.netPoints} pts`);
    console.log(` Profit Factor : ${best.stats.profitFactor}`);
    console.log("==========================================================================");

    // Save best strategy to master_strategy.json
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
    console.log(`\n✅ Updated master_strategy.json with the WINNING Anti-Chop Strategy!`);
}

runSeptemberOptimization().catch(err => console.error("Optimization Error:", err));
