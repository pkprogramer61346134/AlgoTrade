/**
 * MasterSL Line-by-Line Exact Flow Audit Test
 * Test File: scratch/test_exact_line_by_line_mastersl_audit.js
 * 
 * Line-by-line Verification of:
 * 1. maxLossPerTrade (300) -> Initial SL calculation.
 * 2. maxTargetPerTrade (5000) -> Target Price & Target Points calculation.
 * 3. percentTrailingRules:
 *    - 40% Target Hit -> SL shifts to lock 20% profit.
 *    - 60% Target Hit -> SL shifts to lock 45% profit.
 *    - 90% Target Hit -> SL shifts to lock 80% profit.
 * 4. Trailed SL Hit Exit & Target Hit Exit.
 */

const masterSL = require('../server/masterSL/masterSL');
const masterConfig = require('../server/masterSL/config');

async function runLineByLineAudit() {
    console.log("==========================================================================");
    console.log("🧪 LINE-BY-LINE AUDIT TEST: MASTERSL TARGET & PERCENT TRAILING SL FLOW");
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
        const cfg = masterConfig.getConfig();
        assert(cfg.maxLossPerTrade === 300, "maxLossPerTrade config is ₹300");
        assert(cfg.maxTargetPerTrade === 5000, "maxTargetPerTrade config is ₹5000");
        assert(Array.isArray(cfg.percentTrailingRules) && cfg.percentTrailingRules.length === 3, "percentTrailingRules contains 3 rules (40%, 60%, 90%)");

        // ---------------------------------------------------------------------
        // STEP 1: CALCULATE RISK AND TARGET LEVELS FOR ENTRY @ ₹100, QTY 65
        // ---------------------------------------------------------------------
        console.log("\n--- STEP 1: Calculate Risk & Target Levels (Entry @ ₹100.00, Lot 65) ---");
        const entryPrice = 100.00;
        const lotSize = 65;
        const levels = masterSL.calculateRiskAndLevels(entryPrice, "CE", true, { securityId: "99999" }, {}, cfg, lotSize);

        // Risk = 300 / 65 = 4.62 pts -> Initial SL = 100 - 4.62 = 95.38
        assert(levels.riskPoints === 4.62, "Risk points calculated as 4.62 pts");
        assert(levels.initialSl === 95.38, "Initial SL calculated as ₹95.38 (Max Loss ₹300)");

        // Target = 5000 / 65 = 76.92 pts -> Target Price = 100 + 76.92 = 176.92
        assert(levels.targetPoints === 76.92, "Target points calculated as 76.92 pts");
        assert(levels.targetPrice === 176.92, "Target price calculated as ₹176.92 (Max Target ₹5000)");

        // ---------------------------------------------------------------------
        // STEP 2: INITIALIZE ACTIVE POSITION
        // ---------------------------------------------------------------------
        console.log("\n--- STEP 2: Initialize Active Position in MasterSL ---");
        const mockModifiedLog = [];
        const mockHandlers = {
            modifyOrder: async (orderId, newSl, stage) => {
                mockModifiedLog.push({ newSl, stage });
                return true;
            },
            verifyOrderModification: async (orderId, newSl) => ({ isConfirmed: true }),
            closeOrder: async (pos) => true,
            verifyOrderClose: async (secId, orderId) => ({ isClosedOnTerminal: true })
        };

        masterSL.activePosition = {
            tradeId: "AUDIT_LINE_BY_LINE_1",
            symbol: "NIFTY_22250_CE",
            securityId: "99999",
            optionType: "CE",
            isOptionTrade: true,
            entryDate: "2026-10-01",
            entryTime: "10:00:00",
            entryPrice: entryPrice,
            initialSl: levels.initialSl,
            currentSl: levels.initialSl,
            targetPrice: levels.targetPrice,
            targetPoints: levels.targetPoints,
            qty: lotSize,
            lotSize: lotSize,
            trailingStage: "INITIAL",
            status: "OPEN",
            handlers: mockHandlers
        };

        assert(masterSL.activePosition.currentSl === 95.38, "Active position current SL is ₹95.38");

        // ---------------------------------------------------------------------
        // STEP 3: TICK 1 - LTP ₹130.77 (40% Target Hit -> +30.77 Pts)
        // ---------------------------------------------------------------------
        console.log("\n--- STEP 3: Tick 1 @ ₹130.77 (+30.77 pts = 40% Target Hit) ---");
        await masterSL.processTick({ time: "10:15:00", liveLtp: 130.77, status: "live" }, "PAPER");

        // 20% Lock of 76.92 pts = 15.38 pts -> SL = 100 + 15.38 = ₹115.38
        assert(masterSL.activePosition.currentSl === 115.38, "SL SHIFTED to ₹115.38 (20% Lock / ₹1000 Profit Locked)");
        assert(masterSL.activePosition.trailingStage === "TARGET_40%_LOCK_20%", "Stage is TARGET_40%_LOCK_20%");
        assert(mockModifiedLog.length === 1, "modifyOrder executed on terminal (Attempt 1)");

        // ---------------------------------------------------------------------
        // STEP 4: TICK 2 - LTP ₹146.16 (60% Target Hit -> +46.16 Pts >= 46.152 Pts)
        // ---------------------------------------------------------------------
        console.log("\n--- STEP 4: Tick 2 @ ₹146.16 (+46.16 pts = 60% Target Hit) ---");
        await new Promise(r => setTimeout(r, 2050));
        await masterSL.processTick({ time: "10:20:00", liveLtp: 146.16, status: "live" }, "PAPER");

        // 45% Lock of 76.92 pts = 34.61 pts -> SL = 100 + 34.61 = ₹134.61
        assert(masterSL.activePosition.currentSl === 134.61, "SL SHIFTED to ₹134.61 (45% Lock / ₹2250 Profit Locked)");
        assert(masterSL.activePosition.trailingStage === "TARGET_60%_LOCK_45%", "Stage is TARGET_60%_LOCK_45%");
        assert(mockModifiedLog.length === 2, "modifyOrder executed on terminal (Attempt 2)");

        // ---------------------------------------------------------------------
        // STEP 5: TICK 3 - LTP ₹169.23 (90% Target Hit -> +69.23 Pts)
        // ---------------------------------------------------------------------
        console.log("\n--- STEP 5: Tick 3 @ ₹169.23 (+69.23 pts = 90% Target Hit) ---");
        await new Promise(r => setTimeout(r, 2050));
        await masterSL.processTick({ time: "10:25:00", liveLtp: 169.23, status: "live" }, "PAPER");

        // 80% Lock of 76.92 pts = 61.54 pts -> SL = 100 + 61.54 = ₹161.54
        assert(masterSL.activePosition.currentSl === 161.54, "SL SHIFTED to ₹161.54 (80% Lock / ₹4000 Profit Locked)");
        assert(masterSL.activePosition.trailingStage === "TARGET_90%_LOCK_80%", "Stage is TARGET_90%_LOCK_80%");
        assert(mockModifiedLog.length === 3, "modifyOrder executed on terminal (Attempt 3)");

        // ---------------------------------------------------------------------
        // STEP 6: TICK 4 - PRICE DIPS TO ₹160.00 (<= Trailed SL ₹161.54) -> TRAILED SL EXIT
        // ---------------------------------------------------------------------
        console.log("\n--- STEP 6: Price Dips to ₹160.00 (<= Trailed SL ₹161.54) ---");
        await new Promise(r => setTimeout(r, 2050));
        const exitRes = await masterSL.processTick({ time: "10:30:00", liveLtp: 160.00, status: "live" }, "PAPER");

        assert(exitRes !== null, "Trade exited on Trailed SL hit");
        assert(exitRes.exitReason === "TRAILED_SL_HIT (TARGET_90%_LOCK_80%)", "Exit reason is TRAILED_SL_HIT (TARGET_90%_LOCK_80%)");
        assert(exitRes.exitPrice === 161.54, "Exit price is exact trailed SL ₹161.54");
        assert(Math.round(exitRes.realizedPnl) === 4000, "Realized PnL is +₹4,000 Profit Locked!");
        assert(masterSL.activePosition === null, "activePosition cleared after exit");

        console.log("\n==========================================================================");
        if (testPassed) {
            console.log(`🎉 ALL ${testsRun} LINE-BY-LINE AUDIT TESTS PASSED 100%! EXACT MATCH WITH EXPLANATION.`);
        } else {
            console.log(`⚠️ AUDIT TEST COMPLETED WITH FAILURES.`);
        }
        console.log("==========================================================================");

    } catch (err) {
        console.error("💥 EXCEPTION:", err);
        testPassed = false;
    }
}

runLineByLineAudit();
