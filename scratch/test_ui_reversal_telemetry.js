/**
 * UI Reversal Live Telemetry & API Payload Cross-Verification Test
 * Location: C:\AlgoTrade\scratch\test_ui_reversal_telemetry.js
 */

const reversalFilter = require('../server/reversalTest/reversal');
const main = require('../main');

let passCount = 0;
let failCount = 0;

function recordPass(testName, details) {
    passCount++;
    console.log(`✅ [PASS] ${testName}: ${details}`);
}

function recordFail(testName, details) {
    failCount++;
    console.error(`❌ [FAIL] ${testName}: ${details}`);
}

async function runUITelemetryCrossAudit() {
    console.log("==========================================================================");
    console.log("🧪 ALGOTRADE UI DASHBOARD REVERSAL TELEMETRY CROSS-AUDIT TEST");
    console.log("==========================================================================");

    // 1. Test System Ready State Payload
    reversalFilter.activeWatch = null;
    let payload = main.getLiveMarketData();

    if (payload && payload.reversalStatus && payload.reversalStatus.enabled === true) {
        recordPass("UI Payload (System Ready State)", `Reversal Filter active & online | Event: "${payload.reversalStatus.lastFilterEvent}"`);
    } else {
        recordFail("UI Payload (System Ready State)", "Reversal status missing or disabled in UI payload");
    }

    // 2. Test Active Watch Locked State Payload with Live Tick Data
    const mockSignal = {
        consensus: "SELL",
        type: "SELL",
        entry: 22300,
        sl: 22335,
        tr: 22230,
        confidence: "70.0%",
        strategyName: "Master Quantum Strategy",
        time: "13:55:00",
        date: "2026-10-01"
    };

    reversalFilter.evaluateSignal(mockSignal, { close: 22300, low: 22295, high: 22305 });
    reversalFilter.activeWatch.candlesWatched = 2; // set to candle 2
    reversalFilter.updateLiveTick(22318.50); // Live Nifty tick surge to ₹22,318.50

    payload = main.getLiveMarketData();
    const rStat = payload.reversalStatus || {};
    const watch = rStat.activeWatch || {};

    if (watch && watch.type === "SELL" && watch.entryPrice === 22300 && watch.livePrice === 22318.50 && watch.sweepPrice === 22318.50 && watch.stage === "STAGE_2_SWEEP_DETECTED") {
        recordPass("UI Payload (Active Watch Live Telemetry)", `Live Nifty: ₹${watch.livePrice} | Entry: ₹${watch.entryPrice} | Sweep: ₹${watch.sweepPrice} | Drift: +${watch.driftDistancePoints} pts | Stage: ${watch.stage}`);
    } else {
        recordFail("UI Payload (Active Watch Live Telemetry)", "Failed to include live tick telemetry in UI status payload");
    }

    // 3. Test UI Fields Completeness for app.js
    if (rStat.maxWatchCandles === 6 && rStat.maxDriftPoints === 40 && rStat.lastFilterEvent && rStat.isLocked === true) {
        recordPass("UI Payload Fields Completeness", `maxWatchCandles: ${rStat.maxWatchCandles}, maxDriftPoints: ${rStat.maxDriftPoints}, isLocked: ${rStat.isLocked}`);
    } else {
        recordFail("UI Payload Fields Completeness", "Missing required UI telemetry fields in reversalStatus");
    }

    // FINAL SUMMARY
    console.log("\n==========================================================================");
    console.log("📊 [UI TELEMETRY CROSS-AUDIT SUMMARY]");
    console.log("==========================================================================");
    console.log(`✅ TOTAL PASSED: ${passCount}`);
    console.log(`❌ TOTAL FAILED: ${failCount}`);

    if (failCount === 0) {
        console.log("\n🎉 [ALL UI TELEMETRY CHECKS PASSED 100%] Live Tick Reversal Dashboard integration is 100% Verified!");
    } else {
        console.error("\n💥 [UI TELEMETRY AUDIT FAILED] Inspect errors above.");
    }
    console.log("==========================================================================\n");
}

runUITelemetryCrossAudit().catch(err => {
    console.error("💥 [TEST ERROR]:", err);
});
