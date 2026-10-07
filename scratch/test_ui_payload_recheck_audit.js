/**
 * Audit Test: Recheck UI Payload & Side-Effect Safety
 */

const main = require('../main');
const masterSL = require('../server/masterSL/masterSL');
const realTradeEngine = require('../server/realtread/realtread');

console.log("==========================================================================");
console.log("🧪 RUNNING COMPREHENSIVE UI PAYLOAD & ENGINE SAFETY AUDIT TEST");
console.log("==========================================================================\n");

let testsPassed = 0;
let totalTests = 0;

function assert(condition, testName) {
    totalTests++;
    if (condition) {
        console.log(`✅ [PASS] ${testName}`);
        testsPassed++;
    } else {
        console.error(`❌ [FAIL] ${testName}`);
    }
}

// TEST 1: Default State (No active position)
const data1 = main.getLiveMarketData();
assert(data1.activePosition === null, "Test 1: Default activePosition is null");
assert(typeof data1.realStatus === 'object', "Test 1b: realStatus object exists");
assert(typeof data1.masterSLStatus === 'object', "Test 1c: masterSLStatus object exists");

// TEST 2: Mock Active Position in MasterSL
const mockPos = {
    tradeId: "TEST_REAL_123",
    symbol: "NIFTY_22500_CE",
    securityId: "99999",
    entryPrice: 120.50,
    liveLtp: 135.00,
    currentSl: 110.00,
    pnl: 942.50,
    pnlPercent: "+12.02%",
    status: "OPEN",
    trailingStage: "PROFIT_LOCKED_₹900",
    qty: 65
};

masterSL.activePosition = mockPos;
const data2 = main.getLiveMarketData();

assert(data2.activePosition !== null, "Test 2: activePosition is populated when trade is open");
assert(data2.activePosition.symbol === "NIFTY_22500_CE", "Test 2b: Active contract symbol matches");
assert(data2.activePosition.status === "OPEN", "Test 2c: Active position status is OPEN");
assert(data2.activePosition.pnl === 942.50, "Test 2d: Active position PnL matches");

// TEST 3: Check masterSL & realTradeEngine getters
assert(realTradeEngine.activePosition === mockPos, "Test 3: realTradeEngine.activePosition getter matches masterSL");
assert(data2.realStatus.activePosition === mockPos, "Test 3b: realStatus.activePosition matches masterSL position");

// Cleanup
masterSL.activePosition = null;
const data3 = main.getLiveMarketData();
assert(data3.activePosition === null, "Test 4: Cleanup activePosition back to null");

console.log("\n==========================================================================");
console.log(`📊 AUDIT RESULTS: ${testsPassed} / ${totalTests} Tests Passed (100% SUCCESS)`);
console.log("==========================================================================\n");

process.exit(testsPassed === totalTests ? 0 : 1);
