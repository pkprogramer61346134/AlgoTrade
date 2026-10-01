/**
 * Percent Trailing Rules Audit Test
 * Test File: scratch/test_percent_trailing_rules_audit.js
 */

const masterSL = require('../server/masterSL/masterSL');
const masterConfig = require('../server/masterSL/config');

async function runAudit() {
    console.log("==========================================================================");
    console.log("🧪 AUDIT TEST: PERCENT TRAILING RULES (TARGET % -> LOCK % SL SHIFT)");
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
        masterSL.activePosition = null;
        const modifiedSLLog = [];

        const mockHandlers = {
            modifyOrder: async (orderId, newSl, stage) => {
                modifiedSLLog.push({ newSl, stage });
                return true;
            },
            verifyOrderModification: async (orderId, newSl) => ({ isConfirmed: true }),
            closeOrder: async (pos) => true,
            verifyOrderClose: async (secId, orderId) => ({ isClosedOnTerminal: true })
        };

        // Option Entry = ₹100, Target = ₹150 (Target Points = 50 pts)
        masterSL.activePosition = {
            tradeId: "TEST_PERCENT_1",
            symbol: "NIFTY_22250_CE",
            securityId: "99999",
            optionType: "CE",
            isOptionTrade: true,
            entryDate: "2026-10-01",
            entryTime: "10:00:00",
            entryPrice: 100.00,
            initialSl: 95.38,
            currentSl: 95.38,
            targetPoints: 50.00,
            targetPrice: 150.00,
            qty: 65,
            lotSize: 65,
            trailingStage: "INITIAL",
            status: "OPEN",
            handlers: mockHandlers
        };

        // 1. TICK 1: LTP ₹115 (+15 pts profit = 30% of 50 pts target -> below 40%)
        console.log("\n--- TICK 1: Price ₹115.00 (+15 pts profit = 30% of target < 40%) ---");
        await masterSL.processTick({ time: "10:15:00", liveLtp: 115.00, status: "live" }, "PAPER");
        assert(masterSL.activePosition.currentSl === 95.38, "SL stays @ ₹95.38 (No SL shift before 40% target)");

        // 2. TICK 2: LTP ₹120 (+20 pts profit = 40% of 50 pts target -> Hits 40% rule)
        console.log("\n--- TICK 2: Price ₹120.00 (+20 pts profit = 40% of target -> 20% Lock) ---");
        await masterSL.processTick({ time: "10:20:00", liveLtp: 120.00, status: "live" }, "PAPER");
        // 20% lock of 50 pts = 10 pts -> new SL = 100 + 10 = ₹110.00
        assert(masterSL.activePosition.currentSl === 110.00, "SL SHIFTED to ₹110.00 (20% Lock)");
        assert(masterSL.activePosition.trailingStage === "TARGET_40%_LOCK_20%", "Stage updated to TARGET_40%_LOCK_20%");

        // 3. TICK 3: LTP ₹130 (+30 pts profit = 60% of 50 pts target -> Hits 60% rule)
        console.log("\n--- TICK 3: Price ₹130.00 (+30 pts profit = 60% of target -> 45% Lock) ---");
        await new Promise(r => setTimeout(r, 2050));
        await masterSL.processTick({ time: "10:25:00", liveLtp: 130.00, status: "live" }, "PAPER");
        // 45% lock of 50 pts = 22.5 pts -> new SL = 100 + 22.5 = ₹122.50
        assert(masterSL.activePosition.currentSl === 122.50, "SL SHIFTED to ₹122.50 (45% Lock)");
        assert(masterSL.activePosition.trailingStage === "TARGET_60%_LOCK_45%", "Stage updated to TARGET_60%_LOCK_45%");

        // 4. TICK 4: LTP ₹145 (+45 pts profit = 90% of 50 pts target -> Hits 90% rule)
        console.log("\n--- TICK 4: Price ₹145.00 (+45 pts profit = 90% of target -> 80% Lock) ---");
        await new Promise(r => setTimeout(r, 2050));
        await masterSL.processTick({ time: "10:30:00", liveLtp: 145.00, status: "live" }, "PAPER");
        // 80% lock of 50 pts = 40 pts -> new SL = 100 + 40 = ₹140.00
        assert(masterSL.activePosition.currentSl === 140.00, "SL SHIFTED to ₹140.00 (80% Lock)");
        assert(masterSL.activePosition.trailingStage === "TARGET_90%_LOCK_80%", "Stage updated to TARGET_90%_LOCK_80%");

        console.log("\n==========================================================================");
        if (testPassed) {
            console.log(`🎉 ALL ${testsRun} AUDIT TESTS PASSED 100%! ZERO ERRORS.`);
        } else {
            console.log(`⚠️ AUDIT TEST COMPLETED WITH FAILURES.`);
        }
        console.log("==========================================================================");

    } catch (err) {
        console.error("💥 EXCEPTION:", err);
    }
}

runAudit();
