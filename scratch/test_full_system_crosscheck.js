/**
 * Comprehensive System Cross-Check & Dry Run Verification Test
 * Path: scratch/test_full_system_crosscheck.js
 */

const masterSL = require('../server/masterSL/masterSL');
const realTradeEngine = require('../server/realtread/realtread');
const { evaluateConsensusEngine } = require('../utility/usedfull/Engines/consensusEngine');
const { DhanFunds } = require('../utility/dhan-funds');
const { ensureValidDhanToken } = require('../utility/token/autoTokenRefresh');

async function runCrossCheck() {
    console.log("==========================================================================");
    console.log("🔍 ALGOTRADE FULL SYSTEM CROSS-CHECK & INTEGRATION VERIFICATION");
    console.log("==========================================================================");

    let testPassed = true;

    // 1. Dhan Access Token & Authentication Cross-Check
    console.log("\n1️⃣ Checking Dhan Auth Token & Auto-Refresh...");
    try {
        await ensureValidDhanToken();
        console.log("   ✅ Dhan Token valid!");
    } catch (err) {
        console.error("   ❌ Dhan Auth Token check failed:", err.message);
        testPassed = false;
    }

    // 2. Dhan Account Funds API Cross-Check
    console.log("\n2️⃣ Checking Dhan Account Funds API...");
    try {
        const funds = new DhanFunds();
        const fundRes = await funds.getFundLimits();
        if (fundRes && fundRes.status === "success" && fundRes.data) {
            const availBal = Number(fundRes.data.availabelBalance || fundRes.data.withdrawableBalance || 0);
            console.log(`   ✅ Dhan Account Funds API Working! Available Balance: ₹${availBal}`);
        } else {
            console.warn(`   ⚠️ Dhan Funds response warning: ${fundRes?.message || 'Data empty'}`);
        }
    } catch (err) {
        console.error("   ❌ Dhan Funds API call failed:", err.message);
        testPassed = false;
    }

    // 3. Consensus Engine Signal Evaluation Cross-Check
    console.log("\n3️⃣ Testing Consensus Engine Signal Evaluation...");
    try {
        const sampleCandle = {
            date: "2026-09-28",
            time: "10:15:00",
            open: 24800,
            high: 24850,
            low: 24790,
            close: 24840,
            price: 24840,
            volume: 150000
        };

        const res = await evaluateConsensusEngine(sampleCandle, -1, { securityId: "13", exchangeSegment: "IDX_I" });
        console.log(`   ✅ Consensus Engine output generated cleanly! Signal: ${res.consensus}, Confidence: ${res.confidence}`);
    } catch (err) {
        console.error("   ❌ Consensus Engine failed:", err.message);
        testPassed = false;
    }

    // 4. MasterSL Order Placement & Trailing SL Engine Simulation
    console.log("\n4️⃣ Testing MasterSL Order Placement & Trailing SL Rules Simulation...");
    try {
        const mockHandlers = {
            checkBalance: async () => 5000,
            selectStrike: async (spotPrice, optionType, maxBudget) => ({
                securityId: "74003",
                symbol: "NIFTY_24800_CE",
                liveLtp: 150.0,
                lotSize: 65,
                totalQty: 65,
                optionSL: 125.0,
                optionTR1: 175.0,
                optionTR2: 200.0,
                optionTR3: 225.0,
                optionTR4: 250.0,
                optionTR5: 275.0
            }),
            placeOrder: async (payload) => ({
                status: "SUCCESS",
                orderId: "MOCK_ORD_1001",
                quantity: 65,
                securityId: "74003"
            }),
            modifyOrder: async (orderId, newSl, stage) => {
                console.log(`      ↳ [HANDLER CALLBACK] Order ${orderId} SL modified to ₹${newSl} (${stage})`);
                return true;
            },
            closeOrder: async (pos) => {
                console.log(`      ↳ [HANDLER CALLBACK] Order ${pos.orderId} closed at ₹${pos.exitPrice} (${pos.exitReason})`);
                return true;
            }
        };

        // Test Case 4A: Trailed SL Exit Simulation
        masterSL.activePosition = null;
        masterSL.tradeHistory = [];
        masterSL.isOrderInFlight = false;

        const orderResA = await masterSL.processSignal({ consensus: "BUY", entry: 24800, sl: 24775, time: "10:00:00", date: "2026-09-28" }, mockHandlers, "TEST_SIM");
        if (!orderResA || orderResA.status !== "EXECUTED" || !masterSL.activePosition) {
            throw new Error(`Order placement simulation failed: ${orderResA?.reason || 'Unknown error'}`);
        }
        console.log(`   ✅ Order Placement Success! Position: ${masterSL.activePosition.symbol}, Entry: ₹${masterSL.activePosition.entryPrice}, Qty: ${masterSL.activePosition.qty}, SL: ₹${masterSL.activePosition.currentSl}`);

        // Live Tick A1: Price increases to TR1 (175.0) -> Trailing SL to Cost-to-Cost (150.0)
        console.log("   ↳ Simulating Live Tick 1 (Price spikes to TR1 ₹175.0)...");
        await masterSL.processTick({ status: "live", liveLtp: 175.0, price: 175.0, time: "10:01:00" }, "TEST_SIM");
        console.log(`      Active Position SL is now: ₹${masterSL.activePosition?.currentSl} (${masterSL.activePosition?.trailingStage})`);

        // Live Tick A2: Price drops to ₹149.0 (below Trailed SL ₹150.0) -> Exit on Cost-to-Cost SL
        console.log("   ↳ Simulating Live Tick 2 (Price drops to ₹149.0)...");
        const closedPosA = await masterSL.processTick({ status: "live", liveLtp: 149.0, price: 149.0, time: "10:02:00" }, "TEST_SIM");

        if (closedPosA && closedPosA.status === "CLOSED" && closedPosA.exitReason.includes("TRAILED_SL_HIT")) {
            console.log(`   ✅ Trailed SL Exit Verified! Exit Price: ₹${closedPosA.exitPrice}, Reason: ${closedPosA.exitReason}`);
        } else {
            throw new Error("Position failed to exit on trailed SL hit!");
        }

        // Test Case 4B: Target Hit Simulation
        masterSL.activePosition = null;
        masterSL.tradeHistory = [];
        masterSL.isOrderInFlight = false;

        await masterSL.processSignal({ consensus: "BUY", entry: 24800, sl: 24775, time: "10:05:00", date: "2026-09-28" }, mockHandlers, "TEST_SIM");
        console.log("   ↳ Simulating Target Hit (Price spikes to Target ₹275.0)...");
        const closedPosB = await masterSL.processTick({ status: "live", liveLtp: 275.0, price: 275.0, time: "10:06:00" }, "TEST_SIM");

        if (closedPosB && closedPosB.status === "CLOSED" && closedPosB.exitReason.includes("TARGET_HIT")) {
            console.log(`   ✅ Target Hit Exit Verified! Exit Price: ₹${closedPosB.exitPrice}, Reason: ${closedPosB.exitReason}, PnL: ₹${closedPosB.realizedPnl}`);
        } else {
            throw new Error("Position failed to exit on Target Hit!");
        }

    } catch (err) {
        console.error("   ❌ MasterSL Simulation failed:", err.message);
        testPassed = false;
    }

    // 5. Time Window Guards Verification
    console.log("\n5️⃣ Testing Time Window Guards (09:40 AM - 03:10 PM)...");
    try {
        const earlyCheck = masterSL.isWithinTradingHours("09:15:00");
        const validCheck = masterSL.isWithinTradingHours("10:30:00");
        const lateCheck = masterSL.isAfterTradingHours("15:15:00");

        if (!earlyCheck && validCheck && lateCheck) {
            console.log("   ✅ Time Window Guards verified! 09:15 ignored, 10:30 allowed, 15:15 auto-exit active.");
        } else {
            throw new Error(`Time Window Guard check anomaly: early=${earlyCheck}, valid=${validCheck}, late=${lateCheck}`);
        }
    } catch (err) {
        console.error("   ❌ Time Window Guard check failed:", err.message);
        testPassed = false;
    }

    console.log("\n==========================================================================");
    if (testPassed) {
        console.log("🎉 ALL SYSTEM CROSS-CHECKS PASSED SUCCESSFULLY WITH 0 ERRORS!");
    } else {
        console.log("⚠️ SOME CHECKS ENCOUNTERED WARNINGS OR ERRORS.");
    }
    console.log("==========================================================================");
}

runCrossCheck().catch(err => console.error("Unhandled error in cross check:", err));
