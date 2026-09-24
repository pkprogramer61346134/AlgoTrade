/**
 * Test & Verification Script for Paper Trading System
 * Path: C:\AlgoTrade\utility\usedcase\test-papertrade-system.js
 */

const paperConfig = require('../../server/pepertread/config');
const paperEngine = require('../../server/pepertread/pepertread');
const { getCachedCandles } = require('../usedfull/cached-historical-data');
const { evaluateConsensusEngine } = require('../usedfull/Engines/consensusEngine');

async function testPaperTradeSystem() {
    console.log("==========================================================================");
    console.log("🧪 TESTING PAPER TRADING SYSTEM (END-TO-END VERIFICATION)");
    console.log("==========================================================================\n");

    let passed = 0;
    let failed = 0;

    function assert(cond, msg) {
        if (cond) {
            console.log(`  ✅ PASSED: ${msg}`);
            passed++;
        } else {
            console.error(`  ❌ FAILED: ${msg}`);
            failed++;
        }
    }

    try {
        // Step 1: Reset & Verify Paper Config Manager (config.js)
        console.log("1. Verifying Paper Config Manager (config.js)...");
        paperConfig.saveConfig({
            paperTradeEnabled: true,
            initialBalance: 100000.00,
            currentBalance: 100000.00,
            totalPnl: 0.00,
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0
        });
        const cfg = paperConfig.getConfig();
        assert(cfg.paperTradeEnabled === true, "Paper Trade Enabled is true");
        assert(cfg.initialBalance === 100000, `Initial Balance is ₹${cfg.initialBalance}`);
        assert(cfg.currentBalance >= 0, `Active Current Balance is ₹${cfg.currentBalance}`);

        // Step 2: Fetch sample candle dataset and evaluate signal
        console.log("\n2. Evaluating Consensus Signal for Paper Execution...");
        const candlesRes = await getCachedCandles({ securityId: 13, count: 200, date: "2026-09-23" });
        const targetCandleIndex = 147; // 11:05 AM candle (BUY Signal)
        const signal = await evaluateConsensusEngine(candlesRes.data, targetCandleIndex);

        console.log(`   Signal Output: Consensus = ${signal.consensus} | Strategy = ${signal.strategyName}`);
        assert(signal.consensus === "BUY", "Consensus Signal is BUY");

        // Step 3: Execute Paper Order
        console.log("\n3. Executing Paper Order via select-best-strike & paperEngine...");
        await paperEngine.executePaperOrder(signal, cfg.selectedStock);

        const activePos = paperEngine.activePosition;
        assert(activePos !== null, "Active paper position created successfully");
        assert(activePos.symbol.includes("NIFTY"), `Option Contract Selected: ${activePos.symbol}`);
        assert(activePos.status === "OPEN", "Position status is OPEN");
        assert(activePos.totalMargin > 0, `Margin Deducted: ₹${activePos.totalMargin}`);

        // Step 4: Simulate Live Option LTP update & PnL tracking
        console.log("\n4. Simulating Option LTP Live PnL Update & Target Hit Exit...");
        const targetExitLtp = Number((activePos.targetTr4 || activePos.optionTr || 3.5)) + 1.0; // Simulate Target Hit
        
        console.log(`   Simulating Option LTP rising from ₹${activePos.entryLtp} to ₹${targetExitLtp} (Target Hit)...`);
        const closedPos = await paperEngine.closePaperPosition("TARGET_HIT", targetExitLtp);

        assert(closedPos.status === "CLOSED", "Position status changed to CLOSED");
        assert(closedPos.exitReason === "TARGET_HIT", "Exit Reason is TARGET_HIT");
        assert(closedPos.pnl > 0, `Realized Profit PnL: ₹${closedPos.pnl}`);

        // Step 5: Check Updated Balance & History
        console.log("\n5. Checking Updated Balance in config.js & trade_record.json...");
        const updatedCfg = paperConfig.getConfig();
        assert(updatedCfg.totalTrades === 1, `Total Paper Trades count is 1`);
        assert(updatedCfg.winningTrades === 1, `Winning Trades count is 1`);
        assert(updatedCfg.currentBalance > 100000, `Updated Dummy Balance with Profit: ₹${updatedCfg.currentBalance}`);

        // Step 6: Verify UI Payload
        console.log("\n6. Checking UI Status Payload (getStatus())...");
        const uiStatus = paperEngine.getStatus();
        assert(uiStatus.enabled === true, "UI Payload enabled = true");
        assert(uiStatus.winrate.includes("%"), `UI Payload winrate = ${uiStatus.winrate}`);
        assert(uiStatus.history.length >= 1, `UI Payload trade history contains ${uiStatus.history.length} closed trade(s)`);

        console.log("\n==========================================================================");
        console.log(`🏆 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
        console.log("==========================================================================");

        if (failed === 0) {
            console.log("🎉 ALL PAPER TRADING SYSTEM VERIFICATION CHECKS PASSED 100%!");
        }

    } catch (err) {
        console.error("❌ EXCEPTION during paper trade test:", err);
    }
}

testPaperTradeSystem();
