/**
 * MasterSL 5-Stage Percent Trailing Audit Test
 * Location: C:\AlgoTrade\scratch\test_master_sl_trailing_audit.js
 */

const masterSL = require('../server/masterSL/masterSL');
const masterConfig = require('../server/masterSL/config');

async function runMasterSLTrailingAuditTests() {
    console.log("==========================================================================");
    console.log("🧪 COMPREHENSIVE AUDIT TEST: MASTERSL 5-STAGE PERCENT TRAILING ENGINE");
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

    const cfg = masterConfig.getConfig();

    // Verify config setup
    assert(Array.isArray(cfg.percentTrailingRules) && cfg.percentTrailingRules.length === 5, "Config has 5 percentTrailingRules defined in master_config.json");
    assert(cfg.percentTrailingRules[0].targetPercent === 20 && cfg.percentTrailingRules[0].lockPercent === 10, "Stage 1: 20% Target -> 10% Lock");
    assert(cfg.percentTrailingRules[1].targetPercent === 40 && cfg.percentTrailingRules[1].lockPercent === 25, "Stage 2: 40% Target -> 25% Lock");
    assert(cfg.percentTrailingRules[2].targetPercent === 60 && cfg.percentTrailingRules[2].lockPercent === 45, "Stage 3: 60% Target -> 45% Lock");
    assert(cfg.percentTrailingRules[3].targetPercent === 75 && cfg.percentTrailingRules[3].lockPercent === 65, "Stage 4: 75% Target -> 65% Lock");
    assert(cfg.percentTrailingRules[4].targetPercent === 90 && cfg.percentTrailingRules[4].lockPercent === 85, "Stage 5: 90% Target -> 85% Lock");

    // Mock Handlers for Paper/Test Mode
    let lastModifiedSl = null;
    let lastModifiedStage = null;

    const mockHandlers = {
        modifyOrder: async (orderId, newSl, stage) => {
            lastModifiedSl = newSl;
            lastModifiedStage = stage;
            return true;
        },
        closeOrder: async (position) => {
            return true;
        }
    };

    // Initialize mock open position
    // Entry: ₹100, Initial SL: ₹80, Target Points: ₹77 (Target Price = ₹177)
    const entryPrice = 100;
    const initialSl = 80;
    const targetPoints = 77;
    const targetPrice = entryPrice + targetPoints; // ₹177

    masterSL.activePosition = {
        tradeId: "TEST_TRAIL_001",
        symbol: "NIFTY_22500_CE",
        securityId: "999999",
        optionType: "CE",
        isOptionTrade: true,
        entryPrice: entryPrice,
        currentSl: initialSl,
        initialSl: initialSl,
        targetPrice: targetPrice,
        targetPoints: targetPoints,
        qty: 65,
        lotSize: 65,
        trailingStage: "INITIAL",
        status: "OPEN",
        orderId: "MOCK_ORDER_123",
        handlers: mockHandlers,
        envName: "TEST"
    };

    console.log(`\n--- TEST SUITE 1: 5-Stage Trailing SL Progression ---`);
    console.log(`📌 Entry: ₹${entryPrice} | Initial SL: ₹${initialSl} | Target Price: ₹${targetPrice} (Points: ${targetPoints})`);

    // STAGE 1: Target 20% Hit (+15.4 pts = ₹115.40) -> Lock 10% (+7.7 pts = ₹107.70)
    masterSL.lastModifyTimestamp = 0; // Bypass throttle for fast test
    const tickStage1 = { time: "10:00:00", liveLtp: 115.40, status: "live" };
    await masterSL.processTick(tickStage1, "TEST");
    assert(masterSL.activePosition.currentSl === 107.70, "Stage 1 (20% Target): SL trailed to ₹107.70 (Entry + 10%)");
    assert(masterSL.activePosition.trailingStage === "TARGET_20%_LOCK_10%", "Trailing stage label set to TARGET_20%_LOCK_10%");

    // STAGE 2: Target 40% Hit (+30.8 pts = ₹130.80) -> Lock 25% (+19.25 pts = ₹119.25)
    masterSL.lastModifyTimestamp = 0; // Bypass throttle for fast test
    const tickStage2 = { time: "10:05:00", liveLtp: 130.80, status: "live" };
    await masterSL.processTick(tickStage2, "TEST");
    assert(masterSL.activePosition.currentSl === 119.25, "Stage 2 (40% Target): SL trailed to ₹119.25 (Entry + 25%)");
    assert(masterSL.activePosition.trailingStage === "TARGET_40%_LOCK_25%", "Trailing stage label set to TARGET_40%_LOCK_25%");

    // STAGE 3: Target 60% Hit (+46.2 pts = ₹146.20) -> Lock 45% (+34.65 pts = ₹134.65)
    masterSL.lastModifyTimestamp = 0; // Bypass throttle for fast test
    const tickStage3 = { time: "10:10:00", liveLtp: 146.20, status: "live" };
    await masterSL.processTick(tickStage3, "TEST");
    assert(masterSL.activePosition.currentSl === 134.65, "Stage 3 (60% Target): SL trailed to ₹134.65 (Entry + 45%)");
    assert(masterSL.activePosition.trailingStage === "TARGET_60%_LOCK_45%", "Trailing stage label set to TARGET_60%_LOCK_45%");

    // STAGE 4: Target 75% Hit (+57.75 pts = ₹157.75) -> Lock 65% (+50.05 pts = ₹150.05)
    masterSL.lastModifyTimestamp = 0; // Bypass throttle for fast test
    const tickStage4 = { time: "10:15:00", liveLtp: 157.75, status: "live" };
    await masterSL.processTick(tickStage4, "TEST");
    assert(masterSL.activePosition.currentSl === 150.05, "Stage 4 (75% Target): SL trailed to ₹150.05 (Entry + 65%)");
    assert(masterSL.activePosition.trailingStage === "TARGET_75%_LOCK_65%", "Trailing stage label set to TARGET_75%_LOCK_65%");

    // STAGE 5: Target 90% Hit (+69.3 pts = ₹169.30) -> Lock 85% (+65.45 pts = ₹165.45)
    masterSL.lastModifyTimestamp = 0; // Bypass throttle for fast test
    const tickStage5 = { time: "10:20:00", liveLtp: 169.30, status: "live" };
    await masterSL.processTick(tickStage5, "TEST");
    assert(masterSL.activePosition.currentSl === 165.45, "Stage 5 (90% Target): SL trailed to ₹165.45 (Entry + 85%)");
    assert(masterSL.activePosition.trailingStage === "TARGET_90%_LOCK_85%", "Trailing stage label set to TARGET_90%_LOCK_85%");

    // =========================================================================
    // TEST SUITE 2: REVERSAL TRAILED SL EXIT IN PROFIT
    // =========================================================================
    console.log("\n--- TEST SUITE 2: Reversal Trailed SL Exit Verification ---");

    // Price reverses from ₹169.30 down to ₹164.00 (below trailed SL ₹165.45)
    const tickReversal = { time: "10:25:00", liveLtp: 164.00, status: "live" };
    const exitRes = await masterSL.processTick(tickReversal, "TEST");

    assert(exitRes !== null, "Tick below trailed SL triggers position exit");
    assert(exitRes.status === "CLOSED", "Closed position status is CLOSED");
    assert(exitRes.exitReason.includes("TRAILED_SL_HIT"), "Exit reason includes TRAILED_SL_HIT");
    assert(exitRes.exitPrice === 165.45, "Exit price recorded at trailed SL ₹165.45");
    
    // Verify profit realized: (165.45 - 100) * 65 = +₹4,254.25
    const expectedProfit = Number(((165.45 - 100) * 65).toFixed(2));
    assert(exitRes.realizedPnl === expectedProfit, `Realized profit is +₹${expectedProfit} (Locked in profit!)`);
    assert(masterSL.activePosition === null, "Active position reset to null after exit");

    console.log("\n==========================================================================");
    console.log(`🎉 TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${passCount + failCount} ASSERTIONS`);
    console.log("==========================================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runMasterSLTrailingAuditTests();
