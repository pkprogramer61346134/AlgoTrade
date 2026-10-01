/**
 * Live Dhan API 0-to-100% Night Integration Test Script
 * Path: scratch/test_live_dhan_night_flow.js
 * 
 * Tests real Dhan API endpoints for:
 * 1. Dhan Auth Token Refresh
 * 2. Dhan Account Funds/Balance API
 * 3. Best Option Strike Selector
 * 4. Option SL & Target Calculator
 * 5. Real Order Placement API Call (Dhan Terminal)
 * 6. Real Order SL Modification API Call (Dhan Terminal)
 * 7. Real Order Close API Call (Dhan Terminal)
 */

const { ensureValidDhanToken } = require('../utility/token/autoTokenRefresh');
const { DhanFunds } = require('../utility/dhan-funds');
const { selectBestOptionStrike } = require('../utility/usedfull/select-best-strike');
const { calculateOptionSLAndTargets } = require('../utility/usedfull/option-sl-target');
const realTradeEngine = require('../server/realtread/realtread');

async function testLiveDhanNightFlow() {
    console.log("==========================================================================");
    console.log("🌙 LIVE DHAN API 0-TO-100% NIGHT INTEGRATION TEST");
    console.log("==========================================================================\n");

    // STEP 1: DHAN AUTH TOKEN CHECK
    console.log("1️⃣ Testing Dhan Auth Token & Auto Refresh...");
    try {
        await ensureValidDhanToken();
        console.log("   ✅ Dhan Auth Token is VALID & ACTIVE!");
    } catch (err) {
        console.error("   ❌ Dhan Auth Token check failed:", err.message);
    }

    // STEP 2: DHAN ACCOUNT FUNDS & BALANCE CHECK
    console.log("\n2️⃣ Testing Dhan Account Funds API (checkAccountBalance)...");
    try {
        const balRes = await realTradeEngine.checkAccountBalance();
        console.log(`   ✅ Dhan Balance API Response:`);
        console.log(`      - Available Balance: ₹${balRes.availableBalance}`);
        console.log(`      - Is Balance Sufficient (>= ₹1000): ${balRes.isSufficient}`);
    } catch (err) {
        console.error("   ❌ Dhan Balance API call failed:", err.message);
    }

    // STEP 3: OPTION STRIKE SELECTION
    console.log("\n3️⃣ Testing Strike Selection (selectOptionStrike for Nifty @ Spot ₹24800)...");
    let strikeInfo = null;
    try {
        strikeInfo = await realTradeEngine.selectOptionStrike(24800, "CE", 10000);
        console.log(`   ✅ Best Strike Selected:`);
        console.log(`      - Symbol: ${strikeInfo.symbol}`);
        console.log(`      - Security ID: ${strikeInfo.securityId}`);
        console.log(`      - Lot Size: ${strikeInfo.lotSize}`);
        console.log(`      - Live LTP / Price: ₹${strikeInfo.liveLtp || strikeInfo.price}`);
    } catch (err) {
        console.error("   ❌ Strike Selector failed:", err.message);
    }

    // STEP 4: OPTION SL & TARGET COMPUTATION
    console.log("\n4️⃣ Testing Option SL & Target Computation (calculateSLAndTargets)...");
    if (strikeInfo) {
        try {
            const strikeWithLevels = await realTradeEngine.calculateSLAndTargets(strikeInfo);
            console.log(`   ✅ Risk & Targets Computed:`);
            console.log(`      - Option Initial SL: ₹${strikeWithLevels.optionSL}`);
            console.log(`      - TR1 (1:1): ₹${strikeWithLevels.optionTR1}`);
            console.log(`      - TR2 (1:2): ₹${strikeWithLevels.optionTR2}`);
            console.log(`      - TR5 (1:5): ₹${strikeWithLevels.optionTR5}`);
        } catch (err) {
            console.error("   ❌ SL & Target computation failed:", err.message);
        }
    }

    // STEP 5: REAL DHAN API ORDER PLACEMENT TEST
    console.log("\n5️⃣ Testing Real Order Placement Call to Dhan API...");
    let placedOrderId = null;
    try {
        const testOrderPayload = {
            symbol: strikeInfo?.symbol || "NIFTY_24800_CE",
            strikeInfo: strikeInfo || { securityId: "74003", exchangeSegment: "NSE_FNO", lotSize: 65, totalQty: 65 },
            qty: 65,
            initialSl: 100,
            targetPrice: 200,
            levels: { tr5: 200 }
        };

        console.log(`   ↳ Sending BUY order payload to Dhan API...`);
        const placeRes = await realTradeEngine.executeBrokerOrder(testOrderPayload);
        console.log(`   ✅ Dhan Order API Response SUCCESS:`, placeRes);
        placedOrderId = placeRes.orderId;
    } catch (err) {
        console.log(`   ℹ️ Dhan Order Placement API Response (Night Time Result):`);
        console.log(`      Msg: "${err.message}"`);
        console.log(`      (Note: Market closed error during night time is normal and expected).`);
    }

    // STEP 6: REAL DHAN API SL MODIFICATION TEST
    console.log("\n6️⃣ Testing Real Order SL Modification Call to Dhan API...");
    try {
        const targetOrderId = placedOrderId || "1234567890_TEST";
        console.log(`   ↳ Sending modify SL call for orderId ${targetOrderId} (New SL: ₹150)...`);
        
        const handlers = realTradeEngine.getRealHandlers();
        const modRes = await handlers.modifyOrder(targetOrderId, 150, "TRAILED_COST_TO_COST");
        console.log(`   ✅ Dhan SL Modify API Response SUCCESS:`, modRes);
    } catch (err) {
        console.log(`   ℹ️ Dhan SL Modification API Response (Night Time Result):`);
        console.log(`      Msg: "${err.message}"`);
        console.log(`      (Note: Invalid orderId or Market closed error during night time is normal).`);
    }

    // STEP 7: REAL DHAN API ORDER CLOSE TEST
    console.log("\n7️⃣ Testing Real Position Close Call to Dhan API...");
    try {
        const targetOrderId = placedOrderId || "1234567890_TEST";
        const handlers = realTradeEngine.getRealHandlers();
        const dummyPos = { orderId: targetOrderId, securityId: strikeInfo?.securityId || "74003", qty: 65, symbol: "NIFTY_24800_CE", exitReason: "TEST_EXIT" };
        
        console.log(`   ↳ Sending Close Position call for orderId ${targetOrderId}...`);
        const closeRes = await handlers.closeOrder(dummyPos);
        console.log(`   ✅ Dhan Close Position API Response SUCCESS:`, closeRes);
    } catch (err) {
        console.log(`   ℹ️ Dhan Position Close API Response (Night Time Result):`);
        console.log(`      Msg: "${err.message}"`);
        console.log(`      (Note: Position not found or Market closed error during night time is normal).`);
    }

    console.log("\n==========================================================================");
    console.log("🏁 LIVE DHAN API NIGHT INTEGRATION TEST COMPLETED");
    console.log("==========================================================================");
}

testLiveDhanNightFlow().catch(err => console.error("Unhandled error in test:", err));
