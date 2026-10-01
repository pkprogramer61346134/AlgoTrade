/**
 * Deep Audit Step 5: MasterSL Trailing SL & Tick Execution Integration
 * Path: scratch/audit_step5_trailing_tick.js
 */

const masterSL = require('../server/masterSL/masterSL');

async function auditStep5() {
    console.log("==========================================================================");
    console.log("🔍 AUDIT STEP 5: MASTERSL TRAILING SL & TICK INTEGRATION");
    console.log("==========================================================================\n");

    // Reset Engine State
    masterSL.activePosition = null;
    masterSL.tradeHistory = [];
    masterSL.isOrderInFlight = false;
    masterSL.lastOrderTimestamp = 0;
    masterSL.lastModifyTimestamp = 0;

    const modifiedLog = [];
    const closedLog = [];

    const mockHandlers = {
        checkBalance: async () => 15000,
        selectStrike: async (spotPrice, optionType, maxBudget) => ({
            status: "success",
            securityId: "73887",
            symbol: "NIFTY_22600_CE",
            liveLtp: 115.95,
            lotSize: 65,
            totalQty: 65,
            optionSL: 95.0,
            optionTR1: 135.0,
            optionTR2: 155.0,
            optionTR3: 175.0,
            optionTR4: 195.0,
            optionTR5: 215.0
        }),
        placeOrder: async (payload) => ({
            status: "SUCCESS",
            orderId: "ORD_AUDIT_505",
            quantity: 65,
            securityId: "73887"
        }),
        verifyOrderPlacement: async (orderId, secId) => ({ isConfirmed: true, status: "TRADED" }),
        modifyOrder: async (orderId, newSl, stage) => {
            modifiedLog.push({ orderId, newSl, stage });
            return true;
        },
        verifyOrderModification: async (orderId, expectedSl) => ({ isConfirmed: true, status: "TRADED", priceOnTerminal: expectedSl }),
        closeOrder: async (pos) => {
            closedLog.push({ orderId: pos.orderId, exitPrice: pos.exitPrice, exitReason: pos.exitReason });
            return true;
        },
        verifyOrderClose: async (secId, orderId) => ({ isClosedOnTerminal: true, netQty: 0 })
    };

    console.log("1. Setting up Active Position via masterSL.processSignal...");
    const signal = { consensus: "BUY", entry: 24800, date: "2026-09-30", time: "10:00:00" };
    await masterSL.processSignal(signal, mockHandlers, "TEST_ENV");

    console.log("   - Initial SL:", masterSL.activePosition?.currentSl);
    console.log("   - TR1 Level:", masterSL.activePosition?.levels?.tr1);

    // Tick 1: Price reaches TR1 (136.9) -> Trail SL to Cost-to-Cost (115.95)
    console.log("\n2. Processing Live Tick 1 (Price spikes to TR1 ₹137.0)...");
    await masterSL.processTick({ status: "live", liveLtp: 137.0, price: 137.0, time: "10:01:00" }, "TEST_ENV");

    console.log("   - Active Position SL after Tick 1:", masterSL.activePosition?.currentSl);
    console.log("   - Active Position Stage after Tick 1:", masterSL.activePosition?.trailingStage);
    console.log("   - Modify Handler Calls:", modifiedLog);

    // Wait 2.1 seconds for modify cooldown
    await new Promise(r => setTimeout(r, 2100));

    // Tick 2: Price drops to 114.0 (below Trailed SL 115.95) -> Exit on Trailed SL
    console.log("\n3. Processing Live Tick 2 (Price drops to ₹114.0 below Trailed SL ₹115.95)...");
    const closedPos = await masterSL.processTick({ status: "live", liveLtp: 114.0, price: 114.0, time: "10:02:00" }, "TEST_ENV");

    console.log("   - Closed Position Status:", closedPos?.status);
    console.log("   - Exit Price:", closedPos?.exitPrice);
    console.log("   - Exit Reason:", closedPos?.exitReason);
    console.log("   - Realized PnL:", closedPos?.realizedPnl);
    console.log("   - Close Handler Calls:", closedLog);

    // Verification Checks
    const isTrailingValid = modifiedLog.length === 1 && modifiedLog[0].newSl === 115.95;
    const isExitValid = closedLog.length === 1 && closedPos.status === "CLOSED" && closedPos.exitReason.includes("TRAILED_SL_HIT");

    if (isTrailingValid && isExitValid) {
        console.log("\n✅ AUDIT STEP 5 PASSED: MasterSL Trailing SL and Tick exit execution are 100% verified!");
    } else {
        console.error("\n❌ AUDIT STEP 5 FAILED: Trailing SL modification or Exit trigger mismatch!");
    }
}

auditStep5().catch(err => console.error("Step 5 Audit Error:", err));
