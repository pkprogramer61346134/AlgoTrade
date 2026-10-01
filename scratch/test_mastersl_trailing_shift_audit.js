/**
 * MasterSL Dynamic Trailing SL Shift Audit Test
 * Test File: scratch/test_mastersl_trailing_shift_audit.js
 * 
 * Verifies:
 * 1. Zero Runtime Errors / Exceptions in masterSL.js trailing SL logic.
 * 2. SL Shift Step 1 (₹1000 Profit Trigger -> SL shifts to Lock ₹900).
 * 3. SL Shift Step 2 (₹1500 Profit Trigger -> SL shifts to Lock ₹1400).
 * 4. SL Shift Step 3 (₹2000 Profit Trigger -> SL shifts to Lock ₹1900).
 * 5. Trailed SL Hit Exit -> Locks profit on price dip.
 * 
 * CRITICAL RULE: NO CHANGES TO PRODUCTION CODE.
 */

const masterSL = require('../server/masterSL/masterSL');
const masterConfig = require('../server/masterSL/config');

async function runMasterSLAudit() {
    console.log("==========================================================================");
    console.log("🧪 AUDIT TEST: MASTERSL DYNAMIC TRAILING SL SHIFT VERIFICATION");
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
        // Reset state for test
        masterSL.activePosition = null;

        // Mock Handler to capture SL modifications
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

        // Initialize Active Position: Entry @ ₹100, Lot Size = 65
        masterSL.activePosition = {
            tradeId: "TEST_SL_SHIFT_1",
            symbol: "NIFTY_22250_CE",
            securityId: "99999",
            optionType: "CE",
            isOptionTrade: true,
            entryDate: "2026-10-01",
            entryTime: "10:00:00",
            entryPrice: 100.00,
            initialSl: 95.38, // ₹300 max loss on 65 qty (4.62 pts)
            currentSl: 95.38,
            targetPrice: 1638.46, // Big target
            targetLabel: "DYNAMIC_RUPEE_TRAILING",
            qty: 65,
            lotSize: 65,
            trailingStage: "INITIAL",
            status: "OPEN",
            handlers: mockHandlers
        };

        assert(masterSL.activePosition.currentSl === 95.38, "Initial SL is set to ₹95.38 (Risk ₹300)");

        // ---------------------------------------------------------------------
        // TICK 1: LTP ₹105.00 (Profit = (105-100)*65 = ₹325) -> Below ₹1000 Trigger
        // ---------------------------------------------------------------------
        console.log("\n--- TICK 1: Price ₹105.00 (Profit ₹325 < ₹1000 Trigger) ---");
        await masterSL.processTick({ time: "10:15:00", liveLtp: 105.00, price: 105.00, status: "live" }, "PAPER");
        assert(masterSL.activePosition.currentSl === 95.38, "SL remains @ ₹95.38 (No SL shift before ₹1000 profit)");
        assert(modifiedSLLog.length === 0, "No modifyOrder calls made");

        // ---------------------------------------------------------------------
        // TICK 2: LTP ₹116.00 (Profit = (116-100)*65 = ₹1040) -> Hits ₹1000 Trigger
        // ---------------------------------------------------------------------
        console.log("\n--- TICK 2: Price ₹116.00 (Profit ₹1040 >= ₹1000 Trigger) ---");
        await masterSL.processTick({ time: "10:20:00", liveLtp: 116.00, price: 116.00, status: "live" }, "PAPER");
        
        // Expected Lock: ₹1000 - ₹100 = ₹900 profit locked.
        // Points locked = ₹900 / 65 = 13.85 pts -> New SL = ₹100 + 13.85 = ₹113.85
        assert(masterSL.activePosition.currentSl === 113.85, "SL SHIFTED to ₹113.85 (Locked ₹900 Profit)");
        assert(masterSL.activePosition.trailingStage === "PROFIT_LOCKED_₹900", "Stage updated to PROFIT_LOCKED_₹900");
        assert(modifiedSLLog.length === 1, "Broker modifyOrder called ONCE to shift SL on terminal");
        assert(modifiedSLLog[0].newSl === 113.85, "Broker modifyOrder received exact new SL ₹113.85");

        // ---------------------------------------------------------------------
        // TICK 3: LTP ₹124.00 (Profit = (124-100)*65 = ₹1560) -> Hits ₹1500 Trigger
        // ---------------------------------------------------------------------
        console.log("\n--- TICK 3: Price ₹124.00 (Profit ₹1560 >= ₹1500 Trigger) ---");
        await new Promise(res => setTimeout(res, 2050)); // Satisfy 2-second modification rate-limit guard
        await masterSL.processTick({ time: "10:25:00", liveLtp: 124.00, price: 124.00, status: "live" }, "PAPER");

        // Expected Lock: ₹1500 - ₹100 = ₹1400 profit locked.
        // Points locked = ₹1400 / 65 = 21.54 pts -> New SL = ₹100 + 21.54 = ₹121.54
        assert(masterSL.activePosition.currentSl === 121.54, "SL SHIFTED to ₹121.54 (Locked ₹1400 Profit)");
        assert(masterSL.activePosition.trailingStage === "PROFIT_LOCKED_₹1400", "Stage updated to PROFIT_LOCKED_₹1400");
        assert(modifiedSLLog.length === 2, "Broker modifyOrder called SECOND time to shift SL higher");

        // ---------------------------------------------------------------------
        // TICK 4: LTP ₹132.00 (Profit = (132-100)*65 = ₹2080) -> Hits ₹2000 Trigger
        // ---------------------------------------------------------------------
        console.log("\n--- TICK 4: Price ₹132.00 (Profit ₹2080 >= ₹2000 Trigger) ---");
        await new Promise(res => setTimeout(res, 2050)); // Satisfy 2-second modification rate-limit guard
        await masterSL.processTick({ time: "10:30:00", liveLtp: 132.00, price: 132.00, status: "live" }, "PAPER");

        // Expected Lock: ₹2000 - ₹100 = ₹1900 profit locked.
        // Points locked = ₹1900 / 65 = 29.23 pts -> New SL = ₹100 + 29.23 = ₹129.23
        assert(masterSL.activePosition.currentSl === 129.23, "SL SHIFTED to ₹129.23 (Locked ₹1900 Profit)");
        assert(masterSL.activePosition.trailingStage === "PROFIT_LOCKED_₹1900", "Stage updated to PROFIT_LOCKED_₹1900");
        assert(modifiedSLLog.length === 3, "Broker modifyOrder called THIRD time to shift SL higher");

        // ---------------------------------------------------------------------
        // TICK 5: PRICE DIPS TO ₹128.00 (Dips below Trailed SL ₹129.23) -> TRAILED SL EXIT
        // ---------------------------------------------------------------------
        console.log("\n--- TICK 5: Price Dips to ₹128.00 (<= Trailed SL ₹129.23) ---");
        await new Promise(res => setTimeout(res, 2050));
        const exitResult = await masterSL.processTick({ time: "10:35:00", liveLtp: 128.00, price: 128.00, status: "live" }, "PAPER");

        assert(exitResult !== null, "Position closed successfully on Trailed SL hit");
        assert(exitResult.exitReason === "TRAILED_SL_HIT (PROFIT_LOCKED_₹1900)", "Exit reason recorded as TRAILED_SL_HIT");
        assert(exitResult.exitPrice === 129.23, "Exit price recorded at exact trailed SL ₹129.23");
        assert(Math.round(exitResult.realizedPnl) === 1900, "Realized PnL is +₹1,900.00 locked profit");
        assert(masterSL.activePosition === null, "activePosition is cleared (null) after exit");

        console.log("\n==========================================================================");
        if (testPassed) {
            console.log(`🎉 ALL ${testsRun} MASTERSL TRAILING SL AUDIT TESTS PASSED 100%! ZERO ERRORS.`);
        } else {
            console.log(`⚠️ AUDIT TEST COMPLETED WITH FAILURES.`);
        }
        console.log("==========================================================================");

    } catch (err) {
        console.error("💥 [MASTERSL AUDIT EXCEPTION]:", err);
        testPassed = false;
    }
}

runMasterSLAudit();
