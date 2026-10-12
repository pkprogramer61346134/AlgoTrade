const masterSL = require('../server/masterSL/masterSL');

// Test config with 5 SL (₹325 for lot 65) and 10 pt target trailing ladder
const testCfg = {
    maxLossPerTrade: 325,
    maxTargetPerTrade: 10000,
    enableAutoTrailing: true,
    rupeeTrailingRules: [
        { targetRupees: 650, lockRupees: 325 },   // 10 pts target -> Lock 5 pts
        { targetRupees: 780, lockRupees: 455 },   // 12 pts target -> Lock 7 pts
        { targetRupees: 975, lockRupees: 650 },   // 15 pts target -> Lock 10 pts
        { targetRupees: 1300, lockRupees: 975 },  // 20 pts target -> Lock 15 pts
        { targetRupees: 1625, lockRupees: 1300 }, // 25 pts target -> Lock 20 pts
        { targetRupees: 1950, lockRupees: 1625 }, // 30 pts target -> Lock 25 pts
        { targetRupees: 2600, lockRupees: 2275 }, // 40 pts target -> Lock 35 pts
        { targetRupees: 3250, lockRupees: 2925 }, // 50 pts target -> Lock 45 pts
        { targetRupees: 6500, lockRupees: 5850 }, // 100 pts target -> Lock 90 pts
        { targetRupees: 10000, lockRupees: 9200 } // Max Target
    ]
};

const entryPrice = 100.00;
const lotSize = 65;

const levels = masterSL.calculateRiskAndLevels(entryPrice, "CE", true, {}, {}, testCfg, lotSize);
console.log("=== STEP 1: INITIAL LEVELS ===");
console.log("Entry:", entryPrice);
console.log("Initial SL:", levels.initialSl, "(Risk Points:", levels.riskPoints, "pts)");
console.log("Expected SL is exactly 95.00:", levels.initialSl === 95.00 ? "PASS" : "FAIL");

masterSL.activePosition = {
    tradeId: "TEST_5_SL_10_TARGET",
    orderId: "TEST_5_SL_10_TARGET",
    symbol: "NIFTY_22200_CE",
    optionType: "CE",
    isOptionTrade: true,
    entryPrice: entryPrice,
    initialSl: levels.initialSl,
    currentSl: levels.initialSl,
    targetPrice: levels.targetPrice,
    targetLabel: "PERCENT_TRAILING",
    qty: lotSize,
    lotSize: lotSize,
    levels: levels,
    trailingStage: "INITIAL",
    status: "OPEN",
    handlers: {
        modifyOrder: async (orderId, newSl, stage) => {
            console.log(`-> SL Trailed to ₹${newSl} (${stage})`);
            masterSL.activePosition.currentSl = newSl;
            masterSL.activePosition.trailingStage = stage;
            return true;
        },
        closeOrder: async (pos) => {
            console.log(`-> Position Closed: Exit Price ₹${pos.exitPrice}, Reason: ${pos.exitReason}`);
            return true;
        }
    }
};

async function testTicks() {
    console.log("\n=== STEP 2: BEFORE 10 POINTS (NO TRAILING) ===");
    console.log("Testing LTP 105 (+5 pts, +₹325 profit):");
    await masterSL.evaluatePositionTrailing(masterSL.activePosition, { high: 105, low: 104, close: 105 }, testCfg, "TEST");
    console.log("Current SL:", masterSL.activePosition.currentSl, "(Should still be 95.00):", masterSL.activePosition.currentSl === 95.00 ? "PASS" : "FAIL");

    console.log("Testing LTP 109 (+9 pts, +₹585 profit):");
    await masterSL.evaluatePositionTrailing(masterSL.activePosition, { high: 109, low: 108, close: 109 }, testCfg, "TEST");
    console.log("Current SL:", masterSL.activePosition.currentSl, "(Should still be 95.00):", masterSL.activePosition.currentSl === 95.00 ? "PASS" : "FAIL");

    console.log("\n=== STEP 3: AT 10 POINTS TARGET HIT (TRAILING TRIGGERED) ===");
    console.log("Testing LTP 110 (+10 pts, +₹650 profit):");
    await masterSL.evaluatePositionTrailing(masterSL.activePosition, { high: 110, low: 109, close: 110 }, testCfg, "TEST");
    console.log("Current SL:", masterSL.activePosition.currentSl, "(Should be 105.00):", masterSL.activePosition.currentSl === 105.00 ? "PASS" : "FAIL");

    console.log("\n=== STEP 4: AT 15 POINTS (+₹975 profit) ===");
    console.log("Testing LTP 115 (+15 pts, +₹975 profit):");
    await masterSL.evaluatePositionTrailing(masterSL.activePosition, { high: 115, low: 114, close: 115 }, testCfg, "TEST");
    console.log("Current SL:", masterSL.activePosition.currentSl, "(Should be 110.00):", masterSL.activePosition.currentSl === 110.00 ? "PASS" : "FAIL");
}

testTicks();
