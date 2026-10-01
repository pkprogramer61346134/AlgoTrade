/**
 * Reversal & Liquidity Sweep Signal Filter Audit Test
 * Location: C:\AlgoTrade\scratch\test_reversal_filter_audit.js
 */

const reversalFilter = require('../server/reversalTest/reversal');

function runReversalAuditTests() {
    console.log("==========================================================================");
    console.log("🧪 COMPREHENSIVE AUDIT TEST: REVERSAL SIGNAL FILTER (100% COVERAGE)");
    console.log("==========================================================================");

    let passCount = 0;
    let failCount = 0;

    function assert(condition, message) {
        if (condition) {
            passCount++;
            console.log(`✅ [PASS ${passCount}] ${message}`);
        } else {
            failCount++;
            console.error(`❌ [FAIL] ${message}`);
        }
    }

    // Helper to reset reversal filter state
    function resetFilter() {
        reversalFilter.enabled = true;
        reversalFilter.activeWatch = null;
        reversalFilter.maxWatchCandles = 6;
        reversalFilter.maxDriftPoints = 40;
        reversalFilter.watchHistory = [];
    }

    // =========================================================================
    // TEST SUITE 1: BUY SIGNAL REVERSAL SWEEP & RETEST FLOW
    // =========================================================================
    console.log("\n--- TEST SUITE 1: BUY Signal Sweep & Retest Workflow ---");
    resetFilter();

    const buySignal = {
        consensus: "BUY",
        entry: 22500,
        time: "09:20:00",
        date: "2026-10-02",
        strategyName: "TestStrategy"
    };

    // Step 1: Initial Signal Input on Signal Candle 1
    const res1 = reversalFilter.evaluateSignal(buySignal, { close: 22501, high: 22505, low: 22500 });
    assert(res1 === null, "Initial BUY signal enters ACTIVE_WATCH and returns null");
    assert(reversalFilter.activeWatch !== null, "Active watch is locked");
    assert(reversalFilter.activeWatch.type === "BUY", "Active watch type is BUY");
    assert(reversalFilter.activeWatch.entryPrice === 22500, "Active watch entry price is 22500");
    assert(reversalFilter.activeWatch.candlesWatched === 1, "Candle 1 skipped (watched count = 1)");

    // Step 2: Test Active Watch Lock (Incoming SELL Signal while watch is active)
    const incomingSell = { consensus: "SELL", entry: 22520, time: "09:25:00" };
    // Pass Candle 2 (candlesWatched = 2) where price remains above entry (no sweep yet: low=22501, close=22502)
    const resLock = reversalFilter.evaluateSignal(incomingSell, { close: 22502, high: 22505, low: 22501 });
    assert(resLock === null, "Incoming SELL signal while BUY watch is active gets BLOCKED & IGNORED");
    assert(reversalFilter.activeWatch !== null, "Active watch remains open");
    assert(reversalFilter.activeWatch.type === "BUY", "Active watch remains BUY");

    // Step 3: Live Tick Dip below entry on Candle 2+ (Liquidity Sweep @ 22480)
    reversalFilter.updateLiveTick(22480);
    assert(reversalFilter.activeWatch.sweepDetected === true, "Live tick @ 22480 detects liquidity sweep (sweepDetected = true)");
    assert(reversalFilter.activeWatch.sweepPrice === 22480, "Sweep price recorded as 22480");
    assert(reversalFilter.activeWatch.stage === "STAGE_2_SWEEP_DETECTED", "Stage updated to STAGE_2_SWEEP_DETECTED");

    // Step 4: Candle 3 closes BELOW Entry Price (Close = 22490) -> Should NOT confirm
    const candle3 = { close: 22490, high: 22495, low: 22475 };
    const resCandle3 = reversalFilter.evaluateSignal(null, candle3);
    assert(resCandle3 === null, "Candle close @ 22490 (< Entry 22500) DOES NOT confirm signal");
    assert(reversalFilter.activeWatch !== null, "Active watch remains open for retest");

    // Step 5: Candle 4 closes AT OR ABOVE Entry Price (Close = 22505) -> SHOULD CONFIRM!
    const candle4 = { close: 22505, high: 22510, low: 22485 };
    const confirmedBuy = reversalFilter.evaluateSignal(null, candle4);
    assert(confirmedBuy !== null && confirmedBuy.consensus === "BUY", "Candle close @ 22505 (>= Entry 22500) CONFIRMS BUY signal!");
    assert(confirmedBuy.isReversalConfirmed === true, "Confirmed signal has isReversalConfirmed = true");
    assert(confirmedBuy.reversalSweepPrice === 22480, "Confirmed signal preserves sweep price 22480");
    assert(reversalFilter.activeWatch === null, "Active watch is UNLOCKED after confirmation");

    // =========================================================================
    // TEST SUITE 2: SELL SIGNAL REVERSAL SWEEP & RETEST FLOW
    // =========================================================================
    console.log("\n--- TEST SUITE 2: SELL Signal Sweep & Retest Workflow ---");
    resetFilter();

    const sellSignal = {
        consensus: "SELL",
        entry: 22500,
        time: "10:00:00",
        date: "2026-10-02",
        strategyName: "TestStrategy"
    };

    // Step 1: Initial SELL Signal (Candle 1 skipped)
    reversalFilter.evaluateSignal(sellSignal, { close: 22499, high: 22500, low: 22495 });
    assert(reversalFilter.activeWatch.type === "SELL", "Active watch locked for SELL @ 22500");
    assert(reversalFilter.activeWatch.candlesWatched === 1, "SELL Signal Candle 1 skipped");

    // Step 2: Candle 2 evaluation (candlesWatched becomes 2)
    reversalFilter.evaluateSignal(null, { close: 22498, high: 22500, low: 22490 });
    assert(reversalFilter.activeWatch.candlesWatched === 2, "Candle 2 reached (candlesWatched = 2)");

    // Step 3: Live Tick Rally above entry on Candle 2+ (Liquidity Sweep @ 22525)
    reversalFilter.updateLiveTick(22525);
    assert(reversalFilter.activeWatch.sweepDetected === true, "Live tick @ 22525 detects SELL sweep (sweepDetected = true)");
    assert(reversalFilter.activeWatch.sweepPrice === 22525, "Sweep price recorded as 22525");

    // Step 4: Candle 3 closes ABOVE Entry Price (Close = 22510) -> Should NOT confirm
    const sellCandle3 = { close: 22510, high: 22530, low: 22495 };
    const resSell3 = reversalFilter.evaluateSignal(null, sellCandle3);
    assert(resSell3 === null, "SELL Candle close @ 22510 (> Entry 22500) DOES NOT confirm signal");

    // Step 5: Candle 4 closes AT OR BELOW Entry Price (Close = 22495) -> SHOULD CONFIRM!
    const sellCandle4 = { close: 22495, high: 22505, low: 22490 };
    const confirmedSell = reversalFilter.evaluateSignal(null, sellCandle4);
    assert(confirmedSell !== null && confirmedSell.consensus === "SELL", "SELL Candle close @ 22495 (<= Entry 22500) CONFIRMS SELL signal!");
    assert(reversalFilter.activeWatch === null, "Active watch is UNLOCKED after SELL confirmation");

    // =========================================================================
    // TEST SUITE 3: RUNAWAY DRIFT GUARD (40+ Points Drift Limit)
    // =========================================================================
    console.log("\n--- TEST SUITE 3: Runaway Drift Guard (+40 Points Limit) ---");
    resetFilter();

    reversalFilter.evaluateSignal(buySignal, { close: 22501, high: 22505, low: 22500 });
    // Candle 2 closes at 22545 (+45 points runaway drift > 40 pt limit)
    const runawayCandle = { close: 22545, high: 22550, low: 22500 };
    const resRunaway = reversalFilter.evaluateSignal(null, runawayCandle);
    assert(resRunaway === null, "Runaway drift candle (+45 pts) returns null");
    assert(reversalFilter.activeWatch === null, "Runaway drift CANCELS & UNLOCKS active watch to prevent chasing runaway market");

    // =========================================================================
    // TEST SUITE 4: EXPIRY TIMEOUT GUARD (6 Candles Limit)
    // =========================================================================
    console.log("\n--- TEST SUITE 4: Expiry Timeout Guard (6 Candles Limit) ---");
    resetFilter();

    reversalFilter.evaluateSignal(buySignal, { close: 22501, high: 22505, low: 22500 }); // Candle 1

    for (let c = 2; c <= 5; c++) {
        reversalFilter.evaluateSignal(null, { close: 22502, high: 22505, low: 22501 }); // No sweep, staying above entry
    }
    assert(reversalFilter.activeWatch !== null, "Watch remains active during candles 2 to 5");

    // Candle 6 arrives without sweep
    reversalFilter.evaluateSignal(null, { close: 22502, high: 22505, low: 22501 }); // Candle 6
    assert(reversalFilter.activeWatch === null, "Watch EXPIRES after 6 candles (30 mins) without sweep + retest and UNLOCKS system");

    // =========================================================================
    // TEST SUITE 5: BYPASS MODE (enabled = false)
    // =========================================================================
    console.log("\n--- TEST SUITE 5: Bypass Mode (enabled = false) ---");
    resetFilter();
    reversalFilter.enabled = false;

    const bypassRes = reversalFilter.evaluateSignal(buySignal, { close: 22500 });
    assert(bypassRes !== null && bypassRes.consensus === "BUY", "When reversalFilter.enabled = false, signal passes IMMEDIATELY without delay!");

    // Restore filter state
    resetFilter();

    console.log("\n==========================================================================");
    console.log(`🎉 TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${passCount + failCount} ASSERTIONS`);
    console.log("==========================================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runReversalAuditTests();
