/**
 * Scratch Script: Zero-Bug Edge Case Audit for MasterSL & RealTradeEngine
 */
const masterSL = require("../server/masterSL/masterSL");
const masterConfig = require("../server/masterSL/config");

async function runZeroBugAudit() {
    console.log("==========================================================================");
    console.log("🔬 RUNNING ZERO-BUG EDGE CASE AUDIT FOR MASTERSL & REALTRADEENGINE");
    console.log("==========================================================================");

    let passCount = 0;
    let failCount = 0;

    function assert(cond, name) {
        if (cond) {
            console.log(`  ✅ [PASS] ${name}`);
            passCount++;
        } else {
            console.error(`  ❌ [FAIL] ${name}`);
            failCount++;
        }
    }

    // Edge Case 1: Null/Undefined Tick handling
    try {
        const res1 = await masterSL.processTick(null);
        assert(res1 === null, "Null tick returns null gracefully (no crash)");
    } catch (e) {
        assert(false, `Null tick crashed: ${e.message}`);
    }

    // Edge Case 2: Undefined Active Position Tick handling
    try {
        masterSL.activePosition = null;
        const res2 = await masterSL.processTick({ price: 100 });
        assert(res2 === null, "Tick with no active position returns null gracefully");
    } catch (e) {
        assert(false, `No active position tick crashed: ${e.message}`);
    }

    // Edge Case 3: Spot Index Tick vs Option Contract Guard
    try {
        masterSL.activePosition = {
            status: "OPEN",
            isOptionTrade: true,
            entryPrice: 100,
            currentSl: 95,
            targetPrice: 176,
            securityId: "40703",
            symbol: "NIFTY_22600_PE"
        };

        // Send spot index tick ₹22600 to option contract position
        const res3 = await masterSL.processTick({ liveLtp: 22600 });
        assert(res3 === null, "Spot Index Tick (₹22,600) ignored for Option Contract (Entry ₹100)");
    } catch (e) {
        assert(false, `Spot vs Option tick crashed: ${e.message}`);
    }

    // Edge Case 4: NaN / Invalid SL Price Protection
    try {
        masterSL.activePosition.currentSl = NaN;
        const res4 = await masterSL.processTick({ liveLtp: 110 });
        assert(res4 === null, "NaN SL price tick returns null gracefully without crashing");
    } catch (e) {
        assert(false, `NaN SL tick crashed: ${e.message}`);
    }

    // Edge Case 5: Ghost Position Cleanup in getStatus()
    try {
        masterSL.activePosition = { entryPrice: 0, symbol: "GHOST_POS" };
        const status = masterSL.getStatus();
        assert(status.activePosition === null, "Ghost position (entryPrice: 0) cleaned up to null in getStatus()");
    } catch (e) {
        assert(false, `Ghost position cleanup crashed: ${e.message}`);
    }

    // Edge Case 6: 15-Minute Cooldown Calculation Integrity
    try {
        masterSL.lastExitTimestamp = Date.now() - (5 * 60 * 1000); // 5 mins ago
        const status = masterSL.getStatus();
        assert(status.isSlCooldownActive === true, "15-min cooldown is ACTIVE 5 mins after exit");
        assert(status.remainingCooldownMins === 9 || status.remainingCooldownMins === 10, `Remaining cooldown mins correct (${status.remainingCooldownMins}m)`);
        masterSL.lastExitTimestamp = 0; // reset
    } catch (e) {
        assert(false, `Cooldown calculation crashed: ${e.message}`);
    }

    // Edge Case 7: Double-Check 10 Exit Attempts Fail-Safe
    try {
        let closeAttemptsCount = 0;
        masterSL.activePosition = {
            tradeId: "TEST_RETRY_10",
            symbol: "NIFTY_TEST_PE",
            status: "OPEN",
            entryPrice: 100,
            currentSl: 115,
            targetPrice: 176,
            qty: 65,
            securityId: "99999",
            orderId: "MOCK_ORD_99",
            handlers: {
                closeOrder: async () => {
                    closeAttemptsCount++;
                    return true;
                },
                verifyOrderClose: async () => {
                    // Always return false to simulate position still open on broker terminal
                    return { isClosedOnTerminal: false };
                }
            }
        };

        const closeRes = await masterSL.closePosition(115, "TEST_FAIL_10");
        assert(closeAttemptsCount === 10, `Persistent exit loop executed EXACTLY 10 attempts (Got: ${closeAttemptsCount})`);
        assert(closeRes === null, "Close position returned null when exit failed after 10 attempts");
        assert(masterSL.activePosition.status === "EXIT_FAILED", "Active position marked EXIT_FAILED after 10 attempts");
        assert(masterSL.activePosition.exitError.includes("10 Attempts Failed"), "exitError attached correctly");
        masterSL.activePosition = null;
    } catch (e) {
        assert(false, `10 attempts fail-safe crashed: ${e.message}`);
    }

    console.log("==========================================================================");
    console.log(`📊 ZERO-BUG AUDIT RESULTS: ${passCount} PASSED | ${failCount} FAILED`);
    console.log("==========================================================================");
}

runZeroBugAudit();
