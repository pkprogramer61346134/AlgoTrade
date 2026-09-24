/**
 * Test & Verification Script for Trailing SL System
 * Path: C:\AlgoTrade\utility\usedcase\test-trailingsl-system.js
 */

const trailingConfig = require("../../server/trailingsl/config");
const trailingEngine = require("../../server/trailingsl/trailingsl");

async function testTrailingSLSystem() {
    console.log("==========================================================================");
    console.log("🧪 TESTING TRAILING SL SYSTEM (END-TO-END VERIFICATION)");
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
        // Step 1: Verify config.js
        console.log("1. Verifying Trailing Config Manager (config.js)...");
        const cfg = trailingConfig.getConfig();
        assert(cfg.trailingEnabled === true, "Trailing Enabled is true");
        assert(cfg.breathingRoomPoints === 0.5, `Breathing Room Buffer is ${cfg.breathingRoomPoints} points`);

        // Step 2: Execute Trailing Trade
        console.log("\n2. Executing Trailing Trade via select-best-strike & option-sl-target...");
        const pos = await trailingEngine.executeTrailingTrade({
            spotPrice: 24000,
            optionType: "CE",
            maxBudget: 20000,
            isPaper: true
        });

        assert(pos !== null, "Active trailing position created successfully");
        assert(pos.symbol.includes("NIFTY"), `Option Contract Selected: ${pos.symbol}`);
        assert(pos.status === "OPEN", "Position status is OPEN");
        assert(pos.targetTr4 > pos.entryLtp, `Initial Order Target set at TR4 (1:4 Ratio): ₹${pos.targetTr4}`);

        const entryLtp = pos.entryLtp;
        const tr1 = pos.levels.tr1;
        const tr2 = pos.levels.tr2;
        const tr3 = pos.levels.tr3;
        const tr4 = pos.levels.tr4;

        // Step 3: Simulate Tick reaching TR1 (1:1 Ratio) -> Trail to Cost-to-Cost
        console.log("\n3. Simulating Option LTP reaching TR1 (1:1 Ratio)...");
        await trailingEngine.handleOptionLiveTick({ ltp: tr1 + 0.1 });
        const posAfterTR1 = trailingEngine.activePosition;
        assert(posAfterTR1.trailingStage === "TRAILED_COST_TO_COST", `Trailing Stage updated to ${posAfterTR1.trailingStage}`);
        assert(posAfterTR1.currentSl >= (entryLtp - cfg.breathingRoomPoints), `SL Trailed to Cost-to-Cost: ₹${posAfterTR1.currentSl}`);

        // Step 4: Simulate Tick reaching TR1 Midway & TR2 (1:2 Ratio) -> Trail to TR1
        console.log("\n4. Simulating Option LTP reaching TR1 Midway & TR2 (1:2 Ratio)...");
        await trailingEngine.handleOptionLiveTick({ ltp: pos.levels.tr1Midway + 0.01 });
        await trailingEngine.handleOptionLiveTick({ ltp: tr2 + 0.05 });
        const posAfterTR2 = trailingEngine.activePosition;
        assert(posAfterTR2.trailingStage === "TRAILED_TR1", `Trailing Stage updated to ${posAfterTR2.trailingStage}`);
        assert(posAfterTR2.currentSl === tr1, `SL Trailed to TR1 (1:1 level): ₹${posAfterTR2.currentSl}`);

        // Step 5: Simulate Tick reaching TR4 (1:4 Target Hit) -> Exit Position!
        console.log("\n5. Simulating Option LTP reaching TR4 (1:4 Target Hit Exit)...");
        await trailingEngine.handleOptionLiveTick({ ltp: tr4 + 0.5 });

        const history = trailingEngine.tradeHistory;
        assert(history.length > 0, "Trade added to history");
        const closedTrade = history[0];
        assert(closedTrade.status === "CLOSED", "Trade status is CLOSED");
        assert(closedTrade.exitReason === "TR4_TARGET_HIT", `Exit Reason is ${closedTrade.exitReason}`);
        assert(closedTrade.pnl > 0, `Realized Profit PnL: ₹${closedTrade.pnl}`);

        // Step 6: Verify UI Status Payload
        console.log("\n6. Checking UI Status Payload (getStatus())...");
        const uiStatus = trailingEngine.getStatus();
        assert(uiStatus.enabled === true, "UI Payload enabled = true");
        assert(uiStatus.breathingRoomPoints === 0.5, "UI Payload breathingRoomPoints = 0.5");
        assert(uiStatus.history.length >= 1, "UI Payload trade history contains closed trade");

        console.log("\n==========================================================================");
        console.log(`🏆 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
        console.log("==========================================================================");

        if (failed === 0) {
            console.log("🎉 ALL TRAILING SL SYSTEM CHECKS PASSED 100%!");
        }

    } catch (err) {
        console.error("❌ EXCEPTION during trailing SL test:", err);
    }
}

testTrailingSLSystem();
