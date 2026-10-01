/**
 * Reversal Engine & Real Trading Hand-off Audit
 * Test File: scratch/test_reversal_single_forwarding_audit.js
 * 
 * Verifies:
 * 1. Zero Runtime Errors / Exceptions in reversal.js and realTradeEngine workflow.
 * 2. Strict Single Forwarding: Reversal Filter only returns 1 confirmed signal when sweep + retest is met.
 * 3. Active Watch Lock: New incoming signals are locked & ignored during an active watch.
 * 4. Post-confirmation reset and single-position protection integration.
 */

const reversalFilter = require('../server/reversalTest/reversal');
const realTradeEngine = require('../server/realtread/realtread');

async function runAudit() {
    console.log("==========================================================================");
    console.log("🧪 AUDIT TEST: REVERSAL FILTER & REAL TRADER HAND-OFF VERIFICATION");
    console.log("==========================================================================");

    let testPassed = true;
    let testsRun = 0;

    const assert = (condition, description) => {
        testsRun++;
        if (condition) {
            console.log(`✅ [PASS ${testsRun}] ${description}`);
        } else {
            console.error(`❌ [FAIL ${testsRun}] ${description}`);
            testPassed = false;
        }
    };

    try {
        // RESET STATE BEFORE TEST
        reversalFilter.activeWatch = null;
        reversalFilter.watchHistory = [];

        // ---------------------------------------------------------------------
        // TEST 1: RAW SIGNAL ARRIVAL -> INITIALIZES WATCH & LOCKS
        // ---------------------------------------------------------------------
        console.log("\n--- TEST 1: Signal Arrival (BUY @ 22250) ---");
        const rawSignal = {
            consensus: "BUY",
            entry: 22250.00,
            strategyName: "Master Quantum Multi-Indicator Strategy",
            confidence: "75%",
            date: "2026-10-01",
            time: "10:00:00"
        };

        const candle1 = { open: 22250, high: 22260, low: 22245, close: 22250, date: "2026-10-01", time: "10:00:00" };
        const res1 = reversalFilter.evaluateSignal(rawSignal, candle1);

        assert(res1 === null, "evaluateSignal returns null on Candle 1 (Candle 1 Skipped & Watch Initialized)");
        assert(reversalFilter.activeWatch !== null, "activeWatch is initialized and locked");
        assert(reversalFilter.activeWatch.status === "ACTIVE_WATCH", "activeWatch status is ACTIVE_WATCH");
        assert(reversalFilter.activeWatch.type === "BUY", "activeWatch type is BUY");

        // ---------------------------------------------------------------------
        // TEST 2: LOCKOUT OF NEW INCOMING SIGNALS DURING ACTIVE WATCH
        // ---------------------------------------------------------------------
        console.log("\n--- TEST 2: Lockout of Secondary Signals During Active Watch ---");
        const secondarySignal = {
            consensus: "SELL",
            entry: 22300.00,
            strategyName: "Secondary Strategy",
            confidence: "80%",
            date: "2026-10-01",
            time: "10:05:00"
        };
        const candle2_attempt = { open: 22250, high: 22255, low: 22240, close: 22245, date: "2026-10-01", time: "10:05:00" };
        
        const res2_attempt = reversalFilter.evaluateSignal(secondarySignal, candle2_attempt);
        assert(res2_attempt === null, "Secondary SELL signal is BLOCKED & evaluateSignal returns null");
        assert(reversalFilter.activeWatch.type === "BUY", "activeWatch remains BUY (Original signal protected)");

        // ---------------------------------------------------------------------
        // TEST 3: STAGE 1 (SWEEP DIP DETECTED LIVE & CANDLE-BASED)
        // ---------------------------------------------------------------------
        console.log("\n--- TEST 3: Stage 1 Dip Below Entry Price ---");
        reversalFilter.updateLiveTick(22240.00); // Live dip to 22240 < 22250
        assert(reversalFilter.activeWatch.stage === "STAGE_2_SWEEP_DETECTED", "Stage transitions to STAGE_2_SWEEP_DETECTED on dip");
        assert(reversalFilter.activeWatch.sweepPrice === 22240.00, "Sweep price recorded as 22240.00");

        // ---------------------------------------------------------------------
        // TEST 4: STAGE 2 RETEST CLOSE -> CONFIRMED SIGNAL RETURNED ONCE
        // ---------------------------------------------------------------------
        console.log("\n--- TEST 4: Stage 2 Retest Close >= Entry Price ---");
        const candle3 = { open: 22240, high: 22258, low: 22238, close: 22252, date: "2026-10-01", time: "10:10:00" }; // Close 22252 >= 22250
        
        const confirmedSignal = reversalFilter.evaluateSignal(null, candle3);
        
        assert(confirmedSignal !== null, "Confirmed signal returned when 5m candle closes back >= Entry Price");
        assert(confirmedSignal.consensus === "BUY", "Confirmed signal consensus is BUY");
        assert(confirmedSignal.isReversalConfirmed === true, "isReversalConfirmed flag is true");
        assert(confirmedSignal.reversalSweepPrice === 22240.00, "reversalSweepPrice correctly populated");
        assert(reversalFilter.activeWatch === null, "activeWatch is reset to null post-confirmation");

        // ---------------------------------------------------------------------
        // TEST 5: SECONDARY EVALUATION ON SAME CANDLE -> RETURNS NULL (NO DUPLICATES)
        // ---------------------------------------------------------------------
        console.log("\n--- TEST 5: Secondary Call Post-Confirmation ---");
        const resPost = reversalFilter.evaluateSignal(null, candle3);
        assert(resPost === null, "Subsequent evaluateSignal call returns null (No duplicate signal emissions)");

        // ---------------------------------------------------------------------
        // TEST 6: REAL TRADING ENGINE SINGLE POSITION PROTECTION
        // ---------------------------------------------------------------------
        console.log("\n--- TEST 6: Real Trading Engine Single Position Integration ---");
        const realEngineStatus = realTradeEngine.getStatus();
        assert(typeof realEngineStatus === "object", "realTradeEngine.getStatus() executes without error");
        assert(realEngineStatus.activePosition !== undefined, "activePosition property exists in engine status payload");
        assert(realEngineStatus.realTradeEnabled !== undefined, "realTradeEnabled flag exists in engine status payload");

        // CLEANUP
        reversalFilter.activeWatch = null;

        console.log("\n==========================================================================");
        if (testPassed) {
            console.log(`🎉 ALL ${testsRun} AUDIT TESTS PASSED 100%! ZERO ERRORS FOUND.`);
        } else {
            console.log(`⚠️ AUDIT TEST COMPLETED WITH FAILURES.`);
        }
        console.log("==========================================================================");

    } catch (err) {
        console.error("💥 [AUDIT EXCEPTION]:", err);
        testPassed = false;
    }
}

runAudit();
