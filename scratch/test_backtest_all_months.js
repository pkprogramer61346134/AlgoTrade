const fs = require('fs');
const path = require('path');
const engine = require('../server/backtesting/backtesting.js');

const months = [
    { name: "2026-06", from: "2026-06-01", to: "2026-06-30" },
    { name: "2026-07", from: "2026-07-01", to: "2026-07-31" },
    { name: "2026-08", from: "2026-08-01", to: "2026-08-31" },
    { name: "2026-09", from: "2026-09-01", to: "2026-09-30" }
];

const configurations = [
    { target: 40, sl: 20, maxTrades: 1 },
    { target: 50, sl: 25, maxTrades: 1 },
    { target: 60, sl: 30, maxTrades: 1 },
    { target: 70, sl: 35, maxTrades: 1 },
    { target: 80, sl: 40, maxTrades: 1 },
    { target: 40, sl: 20, maxTrades: 2 },
    { target: 60, sl: 30, maxTrades: 2 },
    { target: 70, sl: 35, maxTrades: 2 },
    { target: 70, sl: 35, maxTrades: 3 },
    { target: 80, sl: 35, maxTrades: 3 },
    { target: 90, sl: 45, maxTrades: 3 },
    { target: 100, sl: 50, maxTrades: 3 }
];

const masterPath = path.join(__dirname, '../utility/usedfull/Engines/strategies/master_strategy.json');

async function testConfigurations() {
    console.log("==========================================================================");
    console.log("🔍 TESTING CONFIGURATIONS ON REAL ENGINE (July, Aug, Sept 2026)");
    console.log("==========================================================================\n");

    const results = [];

    for (const config of configurations) {
        // Update master_strategy.json
        const masterContent = [
            {
                "id": "PURE_ORB_DYNAMIC",
                "name": `🌅 ORB Master (Target ${config.target} / SL ${config.sl})`,
                "winrate": "50%",
                "riskRewardRatio": Number((config.target / config.sl).toFixed(2)),
                "indicators": {
                    "orbDurationMinutes": 15,
                    "targetPoints": config.target,
                    "slPoints": config.sl,
                    "maxTradesPerDay": config.maxTrades
                },
                "rules": {
                    "buy": [{ "target": "orb", "condition": "aboveHigh" }],
                    "sell": [{ "target": "orb", "condition": "belowLow" }]
                }
            }
        ];
        fs.writeFileSync(masterPath, JSON.stringify(masterContent, null, 2), 'utf-8');

        let totalPts = 0;
        let greenCount = 0;
        let redCount = 0;
        const monthlyPtsMap = {};

        for (const m of months) {
            try {
                const res = await engine.runBacktest({
                    fromDate: m.from,
                    toDate: m.to,
                    interval: "15",
                    slPoints: config.sl,
                    targetPoints: config.target,
                    maxTradesPerDay: config.maxTrades
                });
                const pts = res.stats ? res.stats.netPoints : 0;
                monthlyPtsMap[m.name] = pts;
                totalPts += pts;
                if (pts > 0) greenCount++;
                else if (pts < 0) redCount++;
            } catch (e) {
                monthlyPtsMap[m.name] = 0;
            }
        }

        results.push({
            config,
            greenCount,
            redCount,
            totalPts: Number(totalPts.toFixed(2)),
            monthlyPtsMap
        });
    }

    results.sort((a, b) => {
        if (b.greenCount !== a.greenCount) return b.greenCount - a.greenCount;
        return b.totalPts - a.totalPts;
    });

    console.log("\n==========================================================================");
    console.log("🏆 ENGINE BACKTEST OPTIMIZATION RESULTS:");
    console.log("==========================================================================");
    for (const r of results) {
        console.log(`Config: Target=${r.config.target} | SL=${r.config.sl} | MaxTrades=${r.config.maxTrades}`);
        console.log(`  -> Green Months: ${r.greenCount} / ${months.length} | Net Pts: +${r.totalPts} pts`);
        console.log(`  -> Monthly: ${JSON.stringify(r.monthlyPtsMap)}\n`);
    }
}

testConfigurations().catch(console.error);
