/**
 * System Audit & Bug Verification Script
 * Audits server/backtesting and utility/usedfull/Engines without modifying production code.
 */

const fs = require('fs');
const path = require('path');

async function runAudit() {
    console.log("==========================================================================");
    console.log("🔎 AUDITING SYSTEM FOR DATA MISMATCHES, WARMUP & INDICATOR BUGS");
    console.log("==========================================================================");

    const issues = [];

    // 1. Check ORB (Opening Range Breakout) hardcoded 5m duration bug
    const orbFile = path.join(__dirname, '../utility/usedfull/Engines/tools/indicators/market_context/opening_range.js');
    if (fs.existsSync(orbFile)) {
        const content = fs.readFileSync(orbFile, 'utf8');
        if (content.includes('durationMinutes / 5') || content.includes('durationMinutes/5')) {
            issues.push({
                severity: "HIGH",
                component: "tools/indicators/market_context/opening_range.js",
                issue: "Hardcoded 5-minute candle divider (durationMinutes / 5)",
                description: "Opening range calculation hardcodes Math.floor(durationMinutes / 5) assuming candles are always 5-minute candles. On 15-minute timeframe, taking 3 candles equals 45 minutes instead of 15 minutes of price action.",
                impact: "ORB indicator calculates 45-minute high/low instead of 15-minute high/low on 15m candles."
            });
        }
    }

    // 2. Check Warmup Count Mismatch (consensus_master_head.json vs consensusEngine.js)
    const masterHeadFile = path.join(__dirname, '../utility/usedfull/Engines/consensus_master_head.json');
    let warmupCountHead = 200;
    if (fs.existsSync(masterHeadFile)) {
        try {
            const head = JSON.parse(fs.readFileSync(masterHeadFile, 'utf8'));
            warmupCountHead = head.warmupCount || 200;
        } catch (e) {}
    }

    if (warmupCountHead === 400) {
        issues.push({
            severity: "MEDIUM",
            component: "consensus_master_head.json (warmupCount: 400)",
            issue: "Warmup Candle Count set to 400 candles",
            description: `warmupCount is set to 400 in consensus_master_head.json. During backtests or real-time signals on 15m candles, fetching 400 past candles requires loading 16 past trading days of data per tick. If disk cache is missing for any past date, it triggers Dhan API TOTP token refresh requests repeatedly.`,
            impact: "Can cause Dhan API TOTP refresh notices or slow execution if historical cache files are incomplete."
        });
    }

    // 3. Check Premature EOD Square-Off Bug (1:00 PM Exit instead of 15:15 PM)
    const backtestingFile = path.join(__dirname, '../server/backtesting/backtesting.js');
    if (fs.existsSync(backtestingFile)) {
        const content = fs.readFileSync(backtestingFile, 'utf8');
        if (content.includes('i === targetCandles.length - 1')) {
            issues.push({
                severity: "HIGH",
                component: "server/backtesting/backtesting.js (isLastCandleOfDay)",
                issue: "Truncated Candle File Premature EOD Exit (1:00 PM Square-Off)",
                description: "isLastCandleOfDay evaluates true if `i === targetCandles.length - 1`. If a cached candle file for a day contains fewer than 25 candles (e.g. data ends at 1:00 PM / 13:00:00 instead of 15:15:00), the backtest engine assumes market close at 1:00 PM and forcibly exits all open trades with 'EOD_SQUARE_OFF' 2 hours early.",
                impact: "Trades are squared off at 1:00 PM instead of running until 3:15 PM if candle data file is incomplete."
            });
        }
    }

    // 4. Check Donchian Indicator Lookback Consistency
    const consensusEngineFile = path.join(__dirname, '../utility/usedfull/Engines/consensusEngine.js');
    if (fs.existsSync(consensusEngineFile)) {
        const content = fs.readFileSync(consensusEngineFile, 'utf8');
        if (content.includes('candles.slice(idx - period, idx)')) {
            issues.push({
                severity: "LOW/INFO",
                component: "Engines/consensusEngine.js (donchian calculation)",
                issue: "Donchian Channel slice excludes current candle",
                description: "Donchian calculation uses `candles.slice(idx - period, idx)` which calculates upper/lower channel from the prior `period` candles excluding current candle. This is causal (no lookahead), but caller should be aware it evaluates breakout against prior 20 candles' high/low.",
                impact: "Strict breakout condition against previous candles."
            });
        }
    }

    console.log("\n==========================================================================");
    console.log(`📋 SYSTEM AUDIT COMPLETED: FOUND ${issues.length} POTENTIAL BUGS / MISMATCHES`);
    console.log("==========================================================================\n");

    issues.forEach((item, index) => {
        console.log(`[BUG #${index + 1}] Severity: ${item.severity}`);
        console.log(` Component  : ${item.component}`);
        console.log(` Issue      : ${item.issue}`);
        console.log(` Description: ${item.description}`);
        console.log(` Impact     : ${item.impact}\n`);
    });

    return issues;
}

runAudit().catch(err => console.error("Audit error:", err));
