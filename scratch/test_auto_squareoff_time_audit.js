/**
 * Auto Square-Off Time Parsing Audit Test
 * Test File: scratch/test_auto_squareoff_time_audit.js
 */

const masterSL = require('../server/masterSL/masterSL');
const masterConfig = require('../server/masterSL/config');

function runTimeAudit() {
    console.log("==========================================================================");
    console.log("🧪 AUDIT TEST: AUTO SQUARE-OFF TIME PARSING (15:10:00 / 3:10 PM)");
    console.log("==========================================================================");

    let testsRun = 0;
    let testPassed = true;

    const assert = (condition, description) => {
        testsRun++;
        if (condition) {
            console.log(`✅ [PASS ${testsRun}] ${description}`);
        } else {
            console.error(`❌ [FAIL ${testsRun}] ${description}`);
            testPassed = false;
        }
    };

    const cfg = masterConfig.getConfig();
    assert(cfg.autoSquareOffTime === "15:10:00", "autoSquareOffTime config is set to '15:10:00' (3:10 PM IST)");

    // ---------------------------------------------------------------------
    // TEST CASES BEFORE 3:10 PM (Trading Hours Active - MUST RETURN FALSE)
    // ---------------------------------------------------------------------
    console.log("\n--- TEST GROUP 1: Times BEFORE 3:10 PM (Must Return FALSE) ---");
    assert(masterSL.isAfterTradingHours("09:15:00") === false, "09:15:00 AM (Market Open) -> false");
    assert(masterSL.isAfterTradingHours("11:30:00") === false, "11:30:00 AM (Mid-day) -> false");
    assert(masterSL.isAfterTradingHours("14:00:00") === false, "14:00:00 PM (2:00 PM) -> false");
    assert(masterSL.isAfterTradingHours("15:00:00") === false, "15:00:00 PM (3:00 PM) -> false");
    assert(masterSL.isAfterTradingHours("15:09:00") === false, "15:09:00 PM (3:09 PM) -> false");
    assert(masterSL.isAfterTradingHours("15:09:59") === false, "15:09:59 PM (3:09:59 PM) -> false");

    // 12-Hour AM/PM Formats
    assert(masterSL.isAfterTradingHours("09:15:00 AM") === false, "09:15:00 AM -> false");
    assert(masterSL.isAfterTradingHours("02:30:00 PM") === false, "02:30:00 PM -> false");
    assert(masterSL.isAfterTradingHours("03:09:00 PM") === false, "03:09:00 PM -> false");

    // ISO Date Time Formats
    assert(masterSL.isAfterTradingHours("2026-10-02T10:30:00") === false, "2026-10-02T10:30:00 -> false");
    assert(masterSL.isAfterTradingHours("2026-10-02T15:09:00") === false, "2026-10-02T15:09:00 -> false");

    // ---------------------------------------------------------------------
    // TEST CASES AT OR AFTER 3:10 PM (Trading Hours Ended - MUST RETURN TRUE)
    // ---------------------------------------------------------------------
    console.log("\n--- TEST GROUP 2: Times AT OR AFTER 3:10 PM (Must Return TRUE) ---");
    assert(masterSL.isAfterTradingHours("15:10:00") === true, "15:10:00 PM (3:10 PM Auto Square-off boundary) -> true");
    assert(masterSL.isAfterTradingHours("15:10:01") === true, "15:10:01 PM -> true");
    assert(masterSL.isAfterTradingHours("15:15:00") === true, "15:15:00 PM (3:15 PM) -> true");
    assert(masterSL.isAfterTradingHours("15:30:00") === true, "15:30:00 PM (Market Close) -> true");
    assert(masterSL.isAfterTradingHours("22:30:00") === true, "22:30:00 PM (Night time) -> true");

    // 12-Hour AM/PM Formats
    assert(masterSL.isAfterTradingHours("03:10:00 PM") === true, "03:10:00 PM -> true");
    assert(masterSL.isAfterTradingHours("03:15:00 PM") === true, "03:15:00 PM -> true");

    // ISO Date Time Formats
    assert(masterSL.isAfterTradingHours("2026-10-02T15:10:00") === true, "2026-10-02T15:10:00 -> true");
    assert(masterSL.isAfterTradingHours("2026-10-02T15:25:00") === true, "2026-10-02T15:25:00 -> true");

    console.log("\n==========================================================================");
    if (testPassed) {
        console.log(`🎉 ALL ${testsRun} AUTO SQUARE-OFF TIME AUDIT TESTS PASSED 100%! ZERO MISTAKES.`);
    } else {
        console.log(`⚠️ TIME AUDIT COMPLETED WITH FAILURES.`);
    }
    console.log("==========================================================================");
}

runTimeAudit();
