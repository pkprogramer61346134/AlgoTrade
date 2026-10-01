/**
 * Deep Audit Step 3: MasterSL Process Signal & Risk Level Payload Integration
 * Path: scratch/audit_step3_mastersl_signal.js
 */

const masterSL = require('../server/masterSL/masterSL');

async function auditStep3() {
    console.log("==========================================================================");
    console.log("🔍 AUDIT STEP 3: MASTERSL PROCESS SIGNAL & PAYLOAD INTEGRATION");
    console.log("==========================================================================\n");

    // Reset Engine State
    masterSL.activePosition = null;
    masterSL.tradeHistory = [];
    masterSL.isOrderInFlight = false;
    masterSL.lastOrderTimestamp = 0;

    // Mock Handlers for Value Inspection
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
            optionTR1: 136.9,
            optionTR2: 157.85,
            optionTR3: 178.8,
            optionTR4: 199.75,
            optionTR5: 220.7
        }),
        placeOrder: async (payload) => {
            console.log("   ↳ [AUDIT INTERCEPT] placeOrder Payload Keys:", Object.keys(payload));
            console.log("      symbol:", payload.symbol);
            console.log("      entryPrice:", payload.entryPrice);
            console.log("      initialSl:", payload.initialSl);
            console.log("      targetPrice:", payload.targetPrice);
            console.log("      qty:", payload.qty);
            return {
                status: "SUCCESS",
                orderId: "ORD_AUDIT_101",
                quantity: payload.qty,
                securityId: payload.strikeInfo.securityId
            };
        },
        verifyOrderPlacement: async (orderId, secId) => ({ isConfirmed: true, status: "TRADED" })
    };

    const signal = { consensus: "BUY", entry: 24800, date: "2026-09-30", time: "10:00:00" };
    console.log("1. Executing masterSL.processSignal(signal, mockHandlers, 'REAL_TRADE')...");
    
    const res = await masterSL.processSignal(signal, mockHandlers, "REAL_TRADE");

    console.log("\n2. Inspecting masterSL.processSignal Output & activePosition:");
    console.log("   - Process Signal Status:", res?.status);
    console.log("   - Active Position Symbol:", masterSL.activePosition?.symbol);
    console.log("   - Active Position Security ID:", masterSL.activePosition?.strikeInfo?.securityId);
    console.log("   - Active Position Entry Price:", masterSL.activePosition?.entryPrice);
    console.log("   - Active Position Initial SL:", masterSL.activePosition?.initialSl);
    console.log("   - Active Position Current SL:", masterSL.activePosition?.currentSl);
    console.log("   - Active Position Target Price:", masterSL.activePosition?.targetPrice);
    console.log("   - Active Position Trailing Stage:", masterSL.activePosition?.trailingStage);
    console.log("   - Active Position Verification:", masterSL.activePosition?.isVerifiedPlacement);

    // Verification Checks
    const isPayloadValid = Boolean(
        masterSL.activePosition &&
        masterSL.activePosition.symbol === "NIFTY_22600_CE" &&
        masterSL.activePosition.entryPrice === 115.95 &&
        masterSL.activePosition.initialSl === 95.0 &&
        masterSL.activePosition.targetPrice === 220.7 &&
        masterSL.activePosition.isVerifiedPlacement === true
    );

    if (isPayloadValid) {
        console.log("\n✅ AUDIT STEP 3 PASSED: MasterSL signal processing and payload mappings are 100% verified!");
    } else {
        console.error("\n❌ AUDIT STEP 3 FAILED: Payload values or activePosition keys mismatch!");
    }
}

auditStep3().catch(err => console.error("Step 3 Audit Error:", err));
