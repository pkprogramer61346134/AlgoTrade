/**
 * Reversal Signal Filter Audit & Test Suite
 * Location: C:\AlgoTrade\scratch\test_reversal_filter.js
 */

const reversalFilter = require('../server/reversalTest/reversal');

console.log("==========================================================================");
console.log("🧪 [TEST SUITE] Reversal Liquidity Sweep Signal Filter Audit");
console.log("==========================================================================");

// Scenario 1: BUY Signal Reversal Test
console.log("\n--- SCENARIO 1: BUY Signal Reversal Dip & Retest Confirmation ---");

const buyConsensusSignal = {
    consensus: "BUY",
    entry: 22500,
    time: "10:15:00",
    date: "2026-10-01",
    strategyName: "MultiStrategyConsensus"
};

// Tick 1: Signal arrives, price @ ₹22,500 (Watch Started)
console.log("\n📍 Tick 1: Engine gives BUY Consensus @ Entry ₹22,500");
let res1 = reversalFilter.evaluateSignal(buyConsensusSignal, { close: 22500, low: 22500, high: 22505 });
console.log("Returned Signal:", res1 ? res1.consensus : "NULL (Watching...)");

// Tick 2: Price dips below entry (Liquidity Sweep @ ₹22,480)
console.log("\n📍 Tick 2: Price Dips to Low ₹22,480 (Sweep Dip)");
let res2 = reversalFilter.evaluateSignal(null, { close: 22485, low: 22480, high: 22500 });
console.log("Returned Signal:", res2 ? res2.consensus : "NULL (Watching...)");

// Tick 3: Candle closes back ABOVE entry @ ₹22,510 (Re-entry Retest Confirmed)
console.log("\n📍 Tick 3: Candle Closes @ ₹22,510 (Re-entry Retest)");
let res3 = reversalFilter.evaluateSignal(null, { close: 22510, low: 22490, high: 22515 });
console.log("Returned Signal:", res3 ? `✅ CONFIRMED ${res3.consensus} @ Reversal Entry ₹${res3.reversalEntryPrice}` : "NULL");

if (res3 && res3.consensus === "BUY" && res3.isReversalConfirmed) {
    console.log("✅ SCENARIO 1 PASSED: BUY Reversal Sweep & Retest successfully confirmed!");
} else {
    console.error("❌ SCENARIO 1 FAILED!");
}

// Scenario 2: SELL Signal Reversal Test
console.log("\n--- SCENARIO 2: SELL Signal Reversal Rally & Retest Confirmation ---");

const sellConsensusSignal = {
    consensus: "SELL",
    entry: 22600,
    time: "11:30:00",
    date: "2026-10-01",
    strategyName: "EMA_Crossover"
};

// Tick 1: Signal arrives @ ₹22,600
console.log("\n📍 Tick 1: Engine gives SELL Consensus @ Entry ₹22,600");
let sell1 = reversalFilter.evaluateSignal(sellConsensusSignal, { close: 22600, low: 22595, high: 22600 });
console.log("Returned Signal:", sell1 ? sell1.consensus : "NULL (Watching...)");

// Tick 2: Price rallies above entry (Liquidity Sweep @ ₹22,620)
console.log("\n📍 Tick 2: Price Rallies to High ₹22,620 (Sweep Rally)");
let sell2 = reversalFilter.evaluateSignal(null, { close: 22615, low: 22600, high: 22620 });
console.log("Returned Signal:", sell2 ? sell2.consensus : "NULL (Watching...)");

// Tick 3: Candle closes back BELOW entry @ ₹22,590 (Re-entry Retest Confirmed)
console.log("\n📍 Tick 3: Candle Closes @ ₹22,590 (Re-entry Retest)");
let sell3 = reversalFilter.evaluateSignal(null, { close: 22590, low: 22585, high: 22605 });
console.log("Returned Signal:", sell3 ? `✅ CONFIRMED ${sell3.consensus} @ Reversal Entry ₹${sell3.reversalEntryPrice}` : "NULL");

if (sell3 && sell3.consensus === "SELL" && sell3.isReversalConfirmed) {
    console.log("✅ SCENARIO 2 PASSED: SELL Reversal Sweep & Retest successfully confirmed!");
} else {
    console.error("❌ SCENARIO 2 FAILED!");
}

console.log("\n==========================================================================");
console.log("🏁 REVERSAL FILTER AUDIT TEST COMPLETE");
console.log("==========================================================================");
