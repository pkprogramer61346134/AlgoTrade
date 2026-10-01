/**
 * Master Integrated End-to-End Audit Test Script
 * Files Audited:
 * 1. C:\AlgoTrade\main.js
 * 2. C:\AlgoTrade\server\reversalTest\reversal.js
 * 3. C:\AlgoTrade\server\masterSL\masterSL.js
 * 
 * Location: C:\AlgoTrade\scratch\test_master_end_to_end_audit.js
 */

const mainModule = require('../main');
const reversalFilter = require('../server/reversalTest/reversal');
const masterSL = require('../server/masterSL/masterSL');
const masterConfig = require('../server/masterSL/config');

async function runMasterEndToEndAudit() {
    console.log("==========================================================================");
    console.log("🧪 MASTER END-TO-END INTEGRATED AUDIT TEST");
    console.log("Auditing: main.js <-> reversal.js <-> masterSL.js");
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
    function resetReversal() {
        reversalFilter.enabled = true;
        reversalFilter.activeWatch = null;
        reversalFilter.maxWatchCandles = 6;
        reversalFilter.maxDriftPoints = 40;
        reversalFilter.watchHistory = [];
    }

    // =========================================================================
    // AUDIT SECTION 1: main.js EXPORTS & DATA PAYLOAD SANITY
    // =========================================================================
    console.log("\n--- AUDIT SECTION 1: main.js Structure & Payload Verification ---");

    assert(typeof mainModule.getLiveMarketData === 'function', "main.js exports getLiveMarketData()");
    assert(typeof mainModule.runFiveMinuteEvaluation === 'function', "main.js exports runFiveMinuteEvaluation()");

    const marketData = mainModule.getLiveMarketData();
    assert(marketData !== null && typeof marketData === 'object', "getLiveMarketData() returns valid object");
    assert('livePrice' in marketData, "marketData contains livePrice");
    assert('reversalStatus' in marketData, "marketData contains reversalStatus payload");
    assert('masterSLStatus' in marketData, "marketData contains masterSLStatus payload");
    assert('config' in marketData, "marketData contains central config payload");

    // =========================================================================
    // AUDIT SECTION 2: reversal.js REVERSAL FILTER INTEGRITY
    // =========================================================================
    console.log("\n--- AUDIT SECTION 2: reversal.js Reversal Engine Integrity ---");
    resetReversal();

    const rawSignal = {
        consensus: "BUY",
        entry: 22500,
        time: "11:00:00",
        date: "2026-10-02",
        strategyName: "ConsensusStrategy"
    };

    // 1. Initial Signal Intake
    const rev1 = reversalFilter.evaluateSignal(rawSignal, { close: 22501, high: 22505, low: 22500 });
    assert(rev1 === null, "Reversal filter locks signal into active watch (returns null)");
    assert(reversalFilter.activeWatch !== null && reversalFilter.activeWatch.type === "BUY", "Active watch locked for BUY @ 22500");

    // 2. Lock Security (Block incoming contrary signals)
    const revLock = reversalFilter.evaluateSignal({ consensus: "SELL", entry: 22510 }, { close: 22502, high: 22505, low: 22501 });
    assert(revLock === null, "Incoming contrary signal blocked while watch is locked");
    assert(reversalFilter.activeWatch.type === "BUY", "Active watch remains BUY");

    // 3. Live Sweep Detection
    reversalFilter.updateLiveTick(22480);
    assert(reversalFilter.activeWatch.sweepDetected === true, "Live tick @ 22480 detects liquidity sweep (sweepPrice: 22480)");

    // 4. Candle Retest Fail (< Entry)
    const revFail = reversalFilter.evaluateSignal(null, { close: 22490, high: 22495, low: 22475 });
    assert(revFail === null, "Candle close @ 22490 (< Entry 22500) rejects premature confirmation");

    // 5. Candle Retest Success (>= Entry) -> Confirmed Signal
    const confirmedSignal = reversalFilter.evaluateSignal(null, { close: 22505, high: 22510, low: 22485 });
    assert(confirmedSignal !== null && confirmedSignal.consensus === "BUY", "Candle close @ 22505 (>= Entry 22500) CONFIRMS reversal signal");
    assert(confirmedSignal.isReversalConfirmed === true, "Confirmed signal payload includes isReversalConfirmed = true");

    // =========================================================================
    // AUDIT SECTION 3: masterSL.js RISK & 5-STAGE TRAILING ENGINE
    // =========================================================================
    console.log("\n--- AUDIT SECTION 3: masterSL.js 5-Stage Trailing & Timing Guard ---");

    // 1. 3:10 PM Trading Hours Guard Test
    assert(masterSL.isAfterTradingHours("15:10:00") === true, "isAfterTradingHours('15:10:00') returns TRUE (3:10 PM cutoff)");
    assert(masterSL.isAfterTradingHours("14:30:00") === false, "isAfterTradingHours('14:30:00') returns FALSE (Normal trading)");

    // 2. Config Verification
    const cfg = masterConfig.getConfig();
    assert(Array.isArray(cfg.percentTrailingRules) && cfg.percentTrailingRules.length === 5, "masterSL configured with 5-Stage percentTrailingRules");

    // 3. Full Integrated Position Execution & Trailing
    const mockHandlers = {
        modifyOrder: async (orderId, newSl, stage) => true,
        closeOrder: async (position) => true
    };

    masterSL.activePosition = {
        tradeId: "E2E_TEST_001",
        symbol: "NIFTY_22500_CE",
        securityId: "999999",
        optionType: "CE",
        isOptionTrade: true,
        entryPrice: 100,
        currentSl: 80,
        initialSl: 80,
        targetPrice: 177,
        targetPoints: 77,
        qty: 65,
        lotSize: 65,
        trailingStage: "INITIAL",
        status: "OPEN",
        orderId: "E2E_ORDER_123",
        handlers: mockHandlers,
        envName: "TEST"
    };

    // 5-Stage Trailing Progression Test
    const trailingTicks = [
        { ltp: 115.40, expectedSl: 107.70, expectedStage: "TARGET_20%_LOCK_10%", label: "Stage 1 (20% Target -> 10% Lock)" },
        { ltp: 130.80, expectedSl: 119.25, expectedStage: "TARGET_40%_LOCK_25%", label: "Stage 2 (40% Target -> 25% Lock)" },
        { ltp: 146.20, expectedSl: 134.65, expectedStage: "TARGET_60%_LOCK_45%", label: "Stage 3 (60% Target -> 45% Lock)" },
        { ltp: 157.75, expectedSl: 150.05, expectedStage: "TARGET_75%_LOCK_65%", label: "Stage 4 (75% Target -> 65% Lock)" },
        { ltp: 169.30, expectedSl: 165.45, expectedStage: "TARGET_90%_LOCK_85%", label: "Stage 5 (90% Target -> 85% Lock)" },
    ];

    for (const step of trailingTicks) {
        masterSL.lastModifyTimestamp = 0; // Bypass 2s throttle for test
        await masterSL.processTick({ time: "11:15:00", liveLtp: step.ltp, status: "live" }, "TEST");
        assert(masterSL.activePosition.currentSl === step.expectedSl, `${step.label}: Trailed SL = ₹${step.expectedSl}`);
        assert(masterSL.activePosition.trailingStage === step.expectedStage, `${step.label}: Stage = ${step.expectedStage}`);
    }

    // Trailed SL Reversal Exit Verification
    const exitTick = { time: "11:25:00", liveLtp: 164.00, status: "live" };
    const exitResult = await masterSL.processTick(exitTick, "TEST");

    assert(exitResult !== null && exitResult.status === "CLOSED", "Reversal tick below trailed SL exits position");
    assert(exitResult.exitPrice === 165.45, "Position exited at exact trailed SL ₹165.45");
    assert(exitResult.realizedPnl === 4254.25, "Realized profit locked at +₹4,254.25");
    assert(masterSL.activePosition === null, "Active position reset to null after exit");

    // =========================================================================
    // AUDIT SUMMARY & VERDICT
    // =========================================================================
    console.log("\n==========================================================================");
    console.log(`🎉 MASTER AUDIT TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${passCount + failCount} ASSERTIONS`);
    console.log("==========================================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runMasterEndToEndAudit();
