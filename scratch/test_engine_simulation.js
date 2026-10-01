/**
 * Engine Simulation & Dry-Run Integration Test
 * Path: scratch/test_engine_simulation.js
 */

const masterSL = require('../server/masterSL/masterSL');
const realTradeEngine = require('../server/realtread/realtread');

async function runSimulationTest() {
    console.log("==========================================================================");
    console.log("🧪 STARTING SYSTEM INTEGRATION & TRAILING SL SIMULATION TEST");
    console.log("==========================================================================\n");

    let allPassed = true;

    // Reset Engine State
    masterSL.activePosition = null;
    masterSL.tradeHistory = [];
    masterSL.isOrderInFlight = false;
    masterSL.lastOrderTimestamp = 0;
    masterSL.lastModifyTimestamp = 0;

    // Mock Handlers for MasterSL Simulation (NO LIVE ORDERS PLACED)
    const mockHandlers = {
        checkBalance: async () => 25000,
        selectStrike: async (spotPrice, optionType, maxBudget) => ({
            status: "success",
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
            orderId: "SIM_BROKER_ORD_999",
            quantity: 65,
            lotSize: 65,
            securityId: "74003"
        }),
        verifyOrderPlacement: async (orderId, secId) => ({ isConfirmed: true, status: "TRADED" }),
        modifyOrder: async (orderId, newSl, stage) => {
            console.log(`      ↳ [MOCK BROKER API] Modify Order ${orderId} -> New SL: ₹${newSl} (${stage})`);
            return true;
        },
        verifyOrderModification: async (orderId, expectedSl) => ({ isConfirmed: true, status: "TRADED", priceOnTerminal: expectedSl }),
        closeOrder: async (pos) => {
            console.log(`      ↳ [MOCK BROKER API] Close Order ${pos.orderId} at ₹${pos.exitPrice} (${pos.exitReason})`);
            return true;
        },
        verifyOrderClose: async (secId, orderId) => ({ isClosedOnTerminal: true, netQty: 0 })
    };

    // TEST 1: Signal Execution & Position Storage
    console.log("1️⃣ Testing Signal Execution & Initial Risk Levels...");
    const signal = { consensus: "BUY", entry: 24800, date: "2026-09-30", time: "10:00:00" };
    const execRes = await masterSL.processSignal(signal, mockHandlers, "PAPER");

    if (execRes && execRes.status === "EXECUTED" && masterSL.activePosition) {
        const pos = masterSL.activePosition;
        console.log(`   ✅ Order Executed Successfully!`);
        console.log(`      Symbol: ${pos.symbol} | Entry: ₹${pos.entryPrice} | Initial SL: ₹${pos.initialSl} | Target (TR5): ₹${pos.targetPrice}`);
        console.log(`      Risk Levels: TR1=₹${pos.levels.tr1}, TR2=₹${pos.levels.tr2}, TR3=₹${pos.levels.tr3}, TR4=₹${pos.levels.tr4}, TR5=₹${pos.levels.tr5}`);
    } else {
        console.error(`   ❌ Signal execution failed:`, execRes);
        allPassed = false;
    }

    // TEST 2: Trailing SL Stage 1 (Price Spikes to TR1 ₹175 -> Trail to Cost-to-Cost ₹150)
    console.log("\n2️⃣ Testing Trailing SL Stage 1 (Price reaches TR1 ₹175)...");
    await masterSL.processTick({ status: "live", liveLtp: 175.0, price: 175.0, time: "10:01:00" }, "PAPER");

    if (masterSL.activePosition && masterSL.activePosition.currentSl === 150.0 && masterSL.activePosition.trailingStage === "TRAILED_COST_TO_COST") {
        console.log(`   ✅ Trailed to Cost-to-Cost verified! Current SL: ₹${masterSL.activePosition.currentSl} (${masterSL.activePosition.trailingStage})`);
    } else {
        console.error(`   ❌ Trailing Stage 1 failed! Current SL: ${masterSL.activePosition?.currentSl}`);
        allPassed = false;
    }

    // Wait 2.1s to respect 2-second SL modification cooldown
    await new Promise(r => setTimeout(r, 2100));

    // TEST 3: Trailing SL Stage 2 (Price Spikes to TR2 ₹200 -> Trail to TR1 ₹175)
    console.log("\n3️⃣ Testing Trailing SL Stage 2 (Price reaches TR2 ₹200)...");
    await masterSL.processTick({ status: "live", liveLtp: 200.0, price: 200.0, time: "10:02:00" }, "PAPER");

    if (masterSL.activePosition && masterSL.activePosition.currentSl === 175.0) {
        console.log(`   ✅ Trailed to TR1 verified! Current SL: ₹${masterSL.activePosition.currentSl} (${masterSL.activePosition.trailingStage})`);
    } else {
        console.error(`   ❌ Trailing Stage 2 failed! Current SL: ${masterSL.activePosition?.currentSl}`);
        allPassed = false;
    }

    // TEST 4: Trailed SL Hit Exit Simulation (Price drops to ₹174 -> Exit on TR1 Locked SL ₹175)
    console.log("\n4️⃣ Testing Trailed SL Exit (Price drops to ₹174)...");
    const closedPos = await masterSL.processTick({ status: "live", liveLtp: 174.0, price: 174.0, time: "10:03:00" }, "PAPER");

    if (closedPos && closedPos.status === "CLOSED" && closedPos.exitReason.includes("TRAILED_SL_HIT")) {
        console.log(`   ✅ Trailed SL Exit Successful!`);
        console.log(`      Exit Price: ₹${closedPos.exitPrice} | Exit Reason: ${closedPos.exitReason} | Realized PnL: ₹${closedPos.realizedPnl}`);
    } else {
        console.error(`   ❌ Trailed SL exit failed! ClosedPos:`, closedPos);
        allPassed = false;
    }

    // TEST 5: Target Hit Exit Simulation (TR5 ₹275)
    console.log("\n5️⃣ Testing Target Hit Exit Simulation (TR5 ₹275)...");
    masterSL.activePosition = null;
    masterSL.lastOrderTimestamp = 0; // Reset order cooldown for test 5
    await masterSL.processSignal(signal, mockHandlers, "PAPER");
    const targetHitPos = await masterSL.processTick({ status: "live", liveLtp: 275.0, price: 275.0, time: "10:05:00" }, "PAPER");

    if (targetHitPos && targetHitPos.status === "CLOSED" && targetHitPos.exitReason.includes("TARGET_HIT")) {
        console.log(`   ✅ Target Hit Exit Successful!`);
        console.log(`      Exit Price: ₹${targetHitPos.exitPrice} | Exit Reason: ${targetHitPos.exitReason} | Realized PnL: ₹${targetHitPos.realizedPnl}`);
    } else {
        console.error(`   ❌ Target Hit exit failed! Pos:`, targetHitPos);
        allPassed = false;
    }

    // TEST 6: RealTradeEngine Status Test
    console.log("\n6️⃣ Testing RealTradeEngine Status & Handlers...");
    const engineStatus = realTradeEngine.getStatus();
    if (engineStatus && Array.isArray(engineStatus.history)) {
        console.log(`   ✅ RealTradeEngine Status Verified! Total Trades in History: ${engineStatus.totalTrades}, Total PnL: ₹${engineStatus.totalPnl}`);
    } else {
        console.error(`   ❌ RealTradeEngine Status Check failed:`, engineStatus);
        allPassed = false;
    }

    console.log("\n==========================================================================");
    if (allPassed) {
        console.log("🎉 ALL SIMULATION TESTS PASSED WITH 0 ERRORS! SYSTEM IS 100% OPERATIONAL.");
    } else {
        console.log("⚠️ SOME SIMULATION CHECKS FAILED.");
    }
    console.log("==========================================================================");
}

runSimulationTest().catch(err => console.error("Unhandled simulation error:", err));
