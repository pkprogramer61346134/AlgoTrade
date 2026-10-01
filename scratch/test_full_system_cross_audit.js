/**
 * Comprehensive System Cross-Audit & End-to-End Pipeline Integration Test
 * Location: C:\AlgoTrade\scratch\test_full_system_cross_audit.js
 * 
 * Features Audited:
 * 1. Real Market Data Fetching & Consensus Evaluation (evaluateConsensusEngine)
 * 2. Reversal Liquidity Sweep & Retest Engine (reversal.js - Stage 1 Sweep -> Stage 2 Retest Close)
 * 3. MasterSL Dynamic Rupee Trailing Engine (Initial ₹300 Loss SL, ₹1000 profit -> ₹900 Lock, ₹500 Step Jumps)
 * 4. Order Payload Validation (targetMode reference guard)
 * 5. 3:10 PM Auto Square-Off & New Signal Block Guards
 * 6. Index Spot vs Option Contract LTP Guard
 */

const { ensureValidDhanToken } = require('../utility/token/autoTokenRefresh');
const { getCandlesBefore } = require('../utility/usedfull/cached-historical-data');
const { evaluateConsensusEngine } = require('../utility/usedfull/Engines/consensusEngine');
const reversalFilter = require('../server/reversalTest/reversal');
const masterSL = require('../server/masterSL/masterSL');
const masterConfig = require('../server/masterSL/config');
const realTradeEngine = require('../server/realtread/realtread');

async function runFullSystemCrossAudit() {
    console.log("==========================================================================");
    console.log("🚀 [FULL SYSTEM CROSS-AUDIT] Complete AlgoTrade End-to-End Pipeline Audit");
    console.log("==========================================================================\n");

    const passResults = [];
    const failResults = [];

    const recordPass = (testName, detail) => {
        console.log(`✅ [PASS] ${testName}: ${detail}`);
        passResults.push({ testName, detail });
    };

    const recordFail = (testName, detail) => {
        console.error(`❌ [FAIL] ${testName}: ${detail}`);
        failResults.push({ testName, detail });
    };

    // --------------------------------------------------------------------------
    // TEST MODULE 1: Real Market Data & Consensus Engine Evaluation
    // --------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------");
    console.log("1️⃣ [TEST MODULE 1] Real Dhan Data Fetching & Consensus Evaluation");
    console.log("--------------------------------------------------------------------------");

    try {
        await ensureValidDhanToken().catch(() => {});
        const now = new Date();
        const currentDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const currentTimeStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

        const consensusRes = await evaluateConsensusEngine({
            securityId: "13",
            exchangeSegment: "IDX_I",
            interval: "5",
            date: currentDateStr,
            time: currentTimeStr
        });

        if (consensusRes && consensusRes.consensus) {
            recordPass("Consensus Engine", `Evaluated signal: ${consensusRes.consensus} | Strategy: ${consensusRes.strategyName || 'None'} | Entry: ₹${consensusRes.entry || 0}`);
        } else {
            recordFail("Consensus Engine", "Failed to return valid consensus output");
        }
    } catch (err) {
        recordFail("Consensus Engine", `Execution error: ${err.message}`);
    }

    // --------------------------------------------------------------------------
    // TEST MODULE 2: Reversal & Liquidity Sweep Engine Audit (BUY & SELL Flows)
    // --------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------");
    console.log("2️⃣ [TEST MODULE 2] Reversal Liquidity Sweep & Retest Confirmation Filter");
    console.log("--------------------------------------------------------------------------");

    // 2A: BUY Signal Reversal Sweep & Retest Test
    reversalFilter.activeWatch = null; // reset filter state
    const simulatedBuySignal = {
        consensus: "BUY",
        entry: 22500,
        time: "10:15:00",
        date: "2026-10-01",
        strategyName: "QuantumConsensus"
    };

    // Step A1: BUY Signal Arrives @ ₹22,500
    let rev1 = reversalFilter.evaluateSignal(simulatedBuySignal, { close: 22500, low: 22500, high: 22505 });
    if (rev1 === null && reversalFilter.activeWatch?.stage === "STAGE_1_WATCH_REVERSAL") {
        recordPass("Reversal Filter (BUY Stage 1)", "BUY signal placed in STAGE_1_WATCH_REVERSAL state");
    } else {
        recordFail("Reversal Filter (BUY Stage 1)", "Failed to set STAGE_1_WATCH_REVERSAL state");
    }

    // Step A2: Price Dips to Low ₹22,480 (Liquidity Sweep below ₹22,500)
    let rev2 = reversalFilter.evaluateSignal(null, { close: 22485, low: 22480, high: 22500 });
    if (rev2 === null && reversalFilter.activeWatch?.stage === "STAGE_2_SWEEP_DETECTED") {
        recordPass("Reversal Filter (BUY Stage 2)", "Dip detected below entry! Transitioned to STAGE_2_SWEEP_DETECTED");
    } else {
        recordFail("Reversal Filter (BUY Stage 2)", "Failed to transition to STAGE_2_SWEEP_DETECTED");
    }

    // Step A3: Candle Closes @ ₹22,510 (Re-entry Retest Confirmed)
    let rev3 = reversalFilter.evaluateSignal(null, { close: 22510, low: 22490, high: 22515 });
    if (rev3 && rev3.consensus === "BUY" && rev3.isReversalConfirmed && rev3.reversalEntryPrice === 22510) {
        recordPass("Reversal Filter (BUY Retest Confirmation)", `BUY Signal confirmed & approved @ Re-entry Close ₹${rev3.reversalEntryPrice}`);
    } else {
        recordFail("Reversal Filter (BUY Retest Confirmation)", "Failed to confirm BUY signal after retest close");
    }

    // 2B: SELL Signal Reversal Sweep & Retest Test
    reversalFilter.activeWatch = null;
    const simulatedSellSignal = {
        consensus: "SELL",
        entry: 22600,
        time: "11:30:00",
        date: "2026-10-01",
        strategyName: "QuantumConsensus"
    };

    // Step B1: SELL Signal Arrives @ ₹22,600
    let srev1 = reversalFilter.evaluateSignal(simulatedSellSignal, { close: 22600, low: 22595, high: 22600 });
    // Step B2: Price Rallies to High ₹22,620 (Liquidity Sweep above ₹22,600)
    let srev2 = reversalFilter.evaluateSignal(null, { close: 22615, low: 22600, high: 22620 });
    // Step B3: Candle Closes @ ₹22,590 (Re-entry Retest Confirmed)
    let srev3 = reversalFilter.evaluateSignal(null, { close: 22590, low: 22585, high: 22605 });

    if (srev3 && srev3.consensus === "SELL" && srev3.isReversalConfirmed && srev3.reversalEntryPrice === 22590) {
        recordPass("Reversal Filter (SELL Retest Confirmation)", `SELL Signal confirmed & approved @ Re-entry Close ₹${srev3.reversalEntryPrice}`);
    } else {
        recordFail("Reversal Filter (SELL Retest Confirmation)", "Failed to confirm SELL signal after retest close");
    }

    // 2C: Watch Expiry Guard Test (6 candles limit)
    reversalFilter.activeWatch = null;
    reversalFilter.evaluateSignal(simulatedBuySignal, { close: 22500, low: 22500, high: 22505 });
    for (let c = 1; c <= 6; c++) {
        reversalFilter.evaluateSignal(null, { close: 22510, low: 22502, high: 22520 }); // keep price above entry so no dip happens
    }
    if (reversalFilter.activeWatch === null && reversalFilter.watchHistory.slice(-1)[0]?.status === "EXPIRED") {
        recordPass("Reversal Filter Expiry Guard", "Watch expired cleanly after 6 candles without reversal sweep");
    } else {
        recordFail("Reversal Filter Expiry Guard", "Failed to expire watch after 6 candles");
    }

    // 2D: Runaway Drift Guard Test (40+ points drift)
    reversalFilter.activeWatch = null;
    reversalFilter.evaluateSignal(simulatedBuySignal, { close: 22500, low: 22500, high: 22505 });
    // Next candle price surges +45 points to ₹22,545
    let driftRes = reversalFilter.evaluateSignal(null, { close: 22545, low: 22500, high: 22548 });
    if (driftRes === null && reversalFilter.activeWatch === null && reversalFilter.watchHistory.slice(-1)[0]?.status === "EXPIRED_RUNAWAY_DRIFT") {
        recordPass("Reversal Filter Runaway Drift Guard", "Signal drifted +45 pts (> 40 pts limit) correctly IGNORED & CANCELLED");
    } else {
        recordFail("Reversal Filter Runaway Drift Guard", "Failed to cancel runaway signal drifting 40+ points");
    }

    // --------------------------------------------------------------------------
    // TEST MODULE 3: MasterSL Dynamic Rupee Trailing SL Engine Audit
    // --------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------");
    console.log("3️⃣ [TEST MODULE 3] MasterSL Dynamic Rupee Trailing Engine Audit");
    console.log("--------------------------------------------------------------------------");

    const cfg = masterConfig.getConfig();
    const entryPrice = 200.00;
    const lotSize = 65;
    const strikeInfo = { securityId: "40698", symbol: "NIFTY_22500_PE", liveLtp: entryPrice, lotSize: lotSize };

    // 3A: Calculate Risk & Levels
    const levels = masterSL.calculateRiskAndLevels(entryPrice, "PE", true, strikeInfo, { sl: 0 }, cfg, lotSize);
    const expectedRiskPoints = Number((cfg.maxLossPerTrade / lotSize).toFixed(2)); // 300 / 65 = 4.62
    const expectedInitialSl = Number((entryPrice - expectedRiskPoints).toFixed(2)); // 200 - 4.62 = 195.38

    if (Math.abs(levels.initialSl - expectedInitialSl) <= 0.02) {
        recordPass("MasterSL Initial SL Calculation", `Exact ₹${cfg.maxLossPerTrade} Risk SL calculated: ₹${levels.initialSl} (Risk pts: ${levels.riskPoints})`);
    } else {
        recordFail("MasterSL Initial SL Calculation", `Expected ₹${expectedInitialSl} but got ₹${levels.initialSl}`);
    }

    // 3B: Simulated Position Execution & Trailing SL Step Verification
    masterSL.activePosition = null; // reset engine position state
    const orderPayload = {
        tradeId: "TEST_CROSS_AUDIT_" + Date.now(),
        symbol: "NIFTY_22500_PE",
        optionType: "PE",
        isOptionTrade: true,
        entryDate: "2026-10-01",
        entryTime: "10:30:00",
        entryPrice: entryPrice,
        initialSl: levels.initialSl,
        currentSl: levels.initialSl,
        targetPrice: levels.targetPrice,
        targetLabel: "DYNAMIC_RUPEE_TRAILING",
        targetMode: cfg.targetMode || "DYNAMIC_RUPEE_TRAILING",
        qty: lotSize,
        lotSize: lotSize,
        strikeInfo: strikeInfo,
        levels: levels,
        trailingStage: "INITIAL",
        status: "OPEN"
    };

    // Store position directly in masterSL
    masterSL.activePosition = { ...orderPayload, handlers: {} };

    // Tick 1: Normal fluctuation @ ₹205 (Profit ₹325) -> SL stays @ ₹195.38
    await masterSL.processTick({ ltp: 205.00, time: "10:35:00", status: "live" }, "PAPER");
    if (masterSL.activePosition.currentSl === levels.initialSl) {
        recordPass("MasterSL Trailing (Below ₹1000)", "SL remains at initial level before reaching ₹1,000 profit trigger");
    } else {
        recordFail("MasterSL Trailing (Below ₹1000)", `SL changed prematurely to ₹${masterSL.activePosition.currentSl}`);
    }

    // Tick 2: Reach ₹1,000 Profit @ LTP ₹215.39 (Profit ₹1,000.35) -> SL jumps to lock ₹900 (₹200 + 900/65 = ₹213.85)
    await masterSL.processTick({ ltp: 215.39, time: "10:40:00", status: "live" }, "PAPER");
    const expectedSlStep1 = Number((entryPrice + (900 / lotSize)).toFixed(2)); // 200 + 13.85 = 213.85
    if (Math.abs(masterSL.activePosition.currentSl - expectedSlStep1) <= 0.05 && masterSL.activePosition.trailingStage === "PROFIT_LOCKED_₹900") {
        recordPass("MasterSL Trailing (₹1,000 Profit Trigger)", `SL jumped to ₹${masterSL.activePosition.currentSl} (${masterSL.activePosition.trailingStage}) locking ₹900 profit`);
    } else {
        recordFail("MasterSL Trailing (₹1,000 Profit Trigger)", `Expected SL ₹${expectedSlStep1} (PROFIT_LOCKED_₹900) but got ₹${masterSL.activePosition.currentSl} (${masterSL.activePosition.trailingStage})`);
    }

    // Wait 2.1s to allow OMS rate limit cooldown (>2000ms) to elapse
    await new Promise(r => setTimeout(r, 2100));

    // Tick 3: Reach ₹1,500 Profit @ LTP ₹223.08 (Profit ₹1,500.20) -> SL jumps to lock ₹1400 (₹200 + 1400/65 = ₹221.54)
    await masterSL.processTick({ ltp: 223.08, time: "10:45:00", status: "live" }, "PAPER");
    const expectedSlStep2 = Number((entryPrice + (1400 / lotSize)).toFixed(2)); // 200 + 21.54 = 221.54
    if (Math.abs(masterSL.activePosition.currentSl - expectedSlStep2) <= 0.05 && masterSL.activePosition.trailingStage === "PROFIT_LOCKED_₹1400") {
        recordPass("MasterSL Trailing (₹1,500 Profit Step)", `SL jumped to ₹${masterSL.activePosition.currentSl} (${masterSL.activePosition.trailingStage}) locking ₹1,400 profit`);
    } else {
        recordFail("MasterSL Trailing (₹1,500 Profit Step)", `Expected SL ₹${expectedSlStep2} (PROFIT_LOCKED_₹1400) but got ₹${masterSL.activePosition.currentSl} (${masterSL.activePosition.trailingStage})`);
    }

    // Wait 2.1s before next tick
    await new Promise(r => setTimeout(r, 2100));

    // Tick 4: Pullback below locked SL @ LTP ₹220.00 -> Position Exit
    const closedPos = await masterSL.processTick({ ltp: 220.00, low: 220.00, time: "10:50:00", status: "live" }, "PAPER");
    if (masterSL.activePosition === null && closedPos && closedPos.status === "CLOSED" && closedPos.realizedPnl >= 1350) {
        recordPass("MasterSL Position Exit & PnL", `Position cleanly closed @ ₹${closedPos.exitPrice} | Reason: ${closedPos.exitReason} | Realized PnL: ₹${closedPos.realizedPnl}`);
    } else {
        recordFail("MasterSL Position Exit & PnL", "Failed to exit position cleanly on SL pullback");
    }

    // --------------------------------------------------------------------------
    // TEST MODULE 4: 3:10 PM Trading Cutoff & Auto Square-Off Audit
    // --------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------");
    console.log("4️⃣ [TEST MODULE 4] 3:10 PM Trading Cutoff & Auto Square-Off Audit");
    console.log("--------------------------------------------------------------------------");

    // 4A: Auto Square-off active position after 3:10 PM
    masterSL.activePosition = { ...orderPayload, handlers: {} };
    const timeExitResult = await masterSL.processTick({ ltp: 202.00, time: "15:10:05", status: "live" }, "PAPER");
    if (masterSL.activePosition === null && timeExitResult && timeExitResult.exitReason === "AUTO_TIME_EXIT_3_10_PM") {
        recordPass("3:10 PM Auto Square-Off", "Active position automatically squared off at 3:10 PM cutoff");
    } else {
        recordFail("3:10 PM Auto Square-Off", "Failed to square off active position at 3:10 PM cutoff");
    }

    // 4B: Block new signals after 3:10 PM
    const lateSignalResult = await masterSL.processSignal({ consensus: "BUY", entry: 22500, time: "15:12:00" }, {}, "PAPER");
    if (lateSignalResult && lateSignalResult.status === "IGNORED" && lateSignalResult.reason === "AFTER_TRADING_HOURS_3_10_PM") {
        recordPass("3:10 PM New Signal Block", "New entry signal after 3:10 PM correctly IGNORED");
    } else {
        recordFail("3:10 PM New Signal Block", "Failed to block new signal after 3:10 PM cutoff");
    }

    // --------------------------------------------------------------------------
    // TEST MODULE 5: Spot Index vs Option Contract Price Guard Audit
    // --------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------");
    console.log("5️⃣ [TEST MODULE 5] Spot Index Price Guard Audit");
    console.log("--------------------------------------------------------------------------");

    masterSL.activePosition = { ...orderPayload, handlers: {} };
    const spotIndexTickResult = await masterSL.processTick({ ltp: 22550.00, liveLtp: 22550.00, time: "11:00:00", status: "live" }, "PAPER");
    if (spotIndexTickResult === null && masterSL.activePosition !== null) {
        recordPass("Spot Index Price Guard", "Nifty spot tick (₹22,550) ignored for active option position (Entry: ₹200)");
    } else {
        recordFail("Spot Index Price Guard", "Failed to ignore Nifty spot tick for option contract");
    }

    masterSL.activePosition = null; // Clean up

    // --------------------------------------------------------------------------
    // SUMMARY OF FULL SYSTEM CROSS-AUDIT
    // --------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log("📊 [AUDIT SUMMARY RESULTS]");
    console.log("==========================================================================");
    console.log(`✅ TOTAL PASSED: ${passResults.length}`);
    console.log(`❌ TOTAL FAILED: ${failResults.length}`);

    if (failResults.length === 0) {
        console.log("\n🎉 [ALL TESTS PASSED 100%] AlgoTrade End-to-End System Pipeline is fully verified!");
    } else {
        console.error("\n⚠️ [AUDIT WARNING] Some test cases failed. Review details above.");
    }
    console.log("==========================================================================\n");
}

runFullSystemCrossAudit();
