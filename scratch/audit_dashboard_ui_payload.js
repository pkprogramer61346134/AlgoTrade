/**
 * Scratch Script: Public Dashboard UI Payload & Render Telemetry Audit
 */
const realTradeEngine = require("../server/realtread/realtread");
const masterSL = require("../server/masterSL/masterSL");

function auditDashboardUIPayload() {
    console.log("==========================================================================");
    console.log("🖥️ RUNNING PUBLIC DASHBOARD UI TELEMETRY & PAYLOAD AUDIT");
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

    // 1. Audit Live Active Trade Payload
    masterSL.activePosition = {
        tradeId: "MASTER_SL_MOCK_001",
        symbol: "NIFTY_22600_PE",
        entryPrice: 53.50,
        liveLtp: 75.20,
        pnl: 1410.50,
        pnlPercent: "40.47%",
        initialSl: 48.88,
        currentSl: 58.88,
        targetPrice: 130.42,
        targetPoints: 76.92,
        qty: 65,
        trailingStage: "TARGET_40%_LOCK_20%",
        status: "OPEN",
        isVerifiedPlacement: true
    };

    const uiPayload = realTradeEngine.getStatus();
    assert(uiPayload.activePosition !== null, "Active Position object exists in UI payload");
    assert(uiPayload.activePosition.symbol === "NIFTY_22600_PE", "Contract Symbol present in UI payload");
    assert(uiPayload.activePosition.entryPrice === 53.50, "Entry Price ₹53.50 present in UI payload");
    assert(uiPayload.activePosition.currentSl === 58.88, "Internal Trailed Memory SL ₹58.88 present in UI payload");
    assert(uiPayload.activePosition.trailingStage === "TARGET_40%_LOCK_20%", "Trailing Stage TARGET_40%_LOCK_20% present in UI payload");

    // 2. Audit Exit Error State Payload
    masterSL.activePosition.status = "EXIT_FAILED";
    masterSL.activePosition.exitError = "🚨 Trailed SL hit ho gaya par order close nahi ho raha hai! (10 Attempts Failed)";

    const errorPayload = realTradeEngine.getStatus();
    assert(errorPayload.activePosition.status === "EXIT_FAILED", "EXIT_FAILED status present in UI payload");
    assert(errorPayload.activePosition.exitError.includes("Trailed SL hit ho gaya par order close nahi ho raha hai!"), "Exact Error message present in UI payload");

    // Reset active position
    masterSL.activePosition = null;

    console.log("==========================================================================");
    console.log(`📊 DASHBOARD UI PAYLOAD AUDIT RESULTS: ${passCount} PASSED | ${failCount} FAILED`);
    console.log("==========================================================================");
}

auditDashboardUIPayload();
