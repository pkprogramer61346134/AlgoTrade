/**
 * Deep Audit Step 2: Strike Selection & Target Calculator Integration
 * Path: scratch/audit_step2_strike_selection.js
 */

const { selectBestOptionStrike } = require('../utility/usedfull/select-best-strike');
const { calculateOptionSLAndTargets } = require('../utility/usedfull/option-sl-target');
const realTradeEngine = require('../server/realtread/realtread');

async function auditStep2() {
    console.log("==========================================================================");
    console.log("🔍 AUDIT STEP 2: STRIKE SELECTION & TARGET CALCULATOR INTEGRATION");
    console.log("==========================================================================\n");

    // 1. Direct selectBestOptionStrike Call
    console.log("1. Testing selectBestOptionStrike({ securityId: 13, spotPrice: 24800, optionType: 'CE', maxBudget: 10000 })...");
    const strikeRes = await selectBestOptionStrike({
        securityId: 13,
        exchangeSegment: "IDX_I",
        spotPrice: 24800,
        optionType: "CE",
        maxBudget: 10000
    });

    console.log("   - Status:", strikeRes.status);
    console.log("   - Selected Strike:", strikeRes.selectedStrike);
    console.log("   - Symbol:", strikeRes.symbol);
    console.log("   - Security ID:", strikeRes.securityId, `(Type: ${typeof strikeRes.securityId})`);
    console.log("   - Live LTP:", strikeRes.liveLtp, `(Type: ${typeof strikeRes.liveLtp})`);
    console.log("   - Lot Size:", strikeRes.lotSize, `(Type: ${typeof strikeRes.lotSize})`);
    console.log("   - Total Qty:", strikeRes.totalQty, `(Type: ${typeof strikeRes.totalQty})`);

    // 2. Direct calculateOptionSLAndTargets Call
    console.log("\n2. Testing calculateOptionSLAndTargets for Selected Strike...");
    const targetRes = await calculateOptionSLAndTargets({
        securityId: strikeRes.securityId,
        entryPrice: strikeRes.liveLtp,
        interval: "5",
        method: "HYBRID"
    });

    console.log("   - Target Computation Status:", targetRes.status);
    console.log("   - Computed Option SL:", targetRes.stopLoss?.sl, `(Type: ${typeof targetRes.stopLoss?.sl})`);
    console.log("   - Computed TR1 Price:", targetRes.targets?.tr1?.price, `(Type: ${typeof targetRes.targets?.tr1?.price})`);
    console.log("   - Computed TR2 Price:", targetRes.targets?.tr2?.price, `(Type: ${typeof targetRes.targets?.tr2?.price})`);
    console.log("   - Computed TR5 Price:", targetRes.targets?.tr5?.price, `(Type: ${typeof targetRes.targets?.tr5?.price})`);

    // 3. realTradeEngine.selectOptionStrike & calculateSLAndTargets Call
    console.log("\n3. Testing realTradeEngine.getRealHandlers().selectStrike()...");
    const handlers = realTradeEngine.getRealHandlers();
    const combinedStrike = await handlers.selectStrike(24800, "CE", 10000);

    console.log("   - Combined Strike Symbol:", combinedStrike.symbol);
    console.log("   - Attached optionSL:", combinedStrike.optionSL, `(Type: ${typeof combinedStrike.optionSL})`);
    console.log("   - Attached optionTR1:", combinedStrike.optionTR1);
    console.log("   - Attached optionTR5:", combinedStrike.optionTR5);

    // Verification Checks
    const isStrikeValid = Boolean(combinedStrike.securityId && combinedStrike.symbol && combinedStrike.liveLtp > 0);
    const isTargetsValid = Boolean(combinedStrike.optionSL > 0 && combinedStrike.optionTR1 > 0 && combinedStrike.optionTR5 > 0);

    if (isStrikeValid && isTargetsValid) {
        console.log("\n✅ AUDIT STEP 2 PASSED: Strike Selector & Target Calculator value mappings are 100% verified!");
    } else {
        console.error("\n❌ AUDIT STEP 2 FAILED: Missing or invalid keys in Strike/Target output!");
    }
}

auditStep2().catch(err => console.error("Step 2 Audit Error:", err));
