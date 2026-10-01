/**
 * Deep Audit Step 1: Dhan Funds & Account Balance Integration
 * Path: scratch/audit_step1_balance_funds.js
 */

const { DhanFunds } = require('../utility/dhan-funds');
const realTradeEngine = require('../server/realtread/realtread');

async function auditStep1() {
    console.log("==========================================================================");
    console.log("🔍 AUDIT STEP 1: DHAN FUNDS & BALANCE CHECK INTEGRATION");
    console.log("==========================================================================\n");

    // 1. Direct DhanFunds API call
    console.log("1. Calling raw DhanFunds.getFundLimits()...");
    const funds = new DhanFunds();
    const rawRes = await funds.getFundLimits();
    
    console.log("   - Response Status:", rawRes?.status);
    console.log("   - Raw Data Keys:", rawRes?.data ? Object.keys(rawRes.data) : "NO DATA");
    console.log("   - availableBalance:", rawRes?.data?.availableBalance);
    console.log("   - withdrawableBalance:", rawRes?.data?.withdrawableBalance);

    // 2. realTradeEngine.checkAccountBalance() call
    console.log("\n2. Calling realTradeEngine.checkAccountBalance()...");
    const engineBal = await realTradeEngine.checkAccountBalance();
    
    console.log("   - Available Balance Returned:", engineBal.availableBalance, `(Type: ${typeof engineBal.availableBalance})`);
    console.log("   - Is Sufficient Flag (>= 1000):", engineBal.isSufficient, `(Type: ${typeof engineBal.isSufficient})`);

    // Verification Checks
    if (typeof engineBal.availableBalance === 'number' && !isNaN(engineBal.availableBalance) && typeof engineBal.isSufficient === 'boolean') {
        console.log("\n✅ AUDIT STEP 1 PASSED: Balance types and keys are 100% verified!");
    } else {
        console.error("\n❌ AUDIT STEP 1 FAILED: Unexpected return types in checkAccountBalance!");
    }
}

auditStep1().catch(err => console.error("Step 1 Audit Error:", err));
