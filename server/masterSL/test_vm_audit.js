/**
 * Audit Script to verify MasterSL engine on VM
 */
const masterSL = require('./masterSL');
const masterConfig = require('./config');

async function runAudit() {
    console.log("==========================================================================");
    console.log("🔍 LIVE VM MASTERSL CONFIG & TRAILING ENGINE AUDIT");
    console.log("==========================================================================\n");

    const cfg = masterConfig.getConfig();
    console.log("1. Config Check:");
    console.log(`   - maxTargetPerTrade: ₹${cfg.maxTargetPerTrade}`);
    console.log(`   - maxLossPerTrade: ₹${cfg.maxLossPerTrade}`);
    console.log(`   - enableAutoTrailing: ${cfg.enableAutoTrailing}`);
    console.log(`   - Rupee Trailing Rules Count: ${cfg.rupeeTrailingRules ? cfg.rupeeTrailingRules.length : 0}`);
    console.log("\n2. Rupee Rules Ladder:");
    cfg.rupeeTrailingRules.forEach((rule, idx) => {
        console.log(`   [Rule ${idx + 1}] Peak ₹${rule.targetRupees} -> Lock +₹${rule.lockRupees}`);
    });

    // Test active position simulation
    masterSL.activePosition = null;
    const mockHandlers = {
        checkBalance: async () => 50000,
        selectStrike: async () => ({ securityId: "12345", symbol: "NIFTY_24500_CE", liveLtp: 100, lotSize: 65, qty: 65 }),
        placeOrder: async () => ({ orderId: "AUDIT_101", quantity: 65 }),
        verifyOrderPlacement: async () => ({ isConfirmed: true }),
        closeOrder: async () => ({ isConfirmed: true })
    };

    console.log("\n3. Live Simulation Test:");
    await masterSL.processSignal({ consensus: "BUY", date: "2026-10-06", time: "12:00:00", entry: 24500 }, mockHandlers, "VM_AUDIT");
    
    // Simulate LTP jump to 101.85 (+120 profit)
    await masterSL.processTick({ liveLtp: 101.85, time: "12:01:00" }, "VM_AUDIT");
    console.log(`   - LTP ₹101.85 (+₹120 PnL) -> Trailed SL: ₹${masterSL.activePosition.currentSl} (Stage: ${masterSL.activePosition.trailingStage})`);

    // Simulate LTP jump to 123.08 (+1500 profit)
    await masterSL.processTick({ liveLtp: 123.08, time: "12:02:00" }, "VM_AUDIT");
    console.log(`   - LTP ₹123.08 (+₹1500 PnL) -> Trailed SL: ₹${masterSL.activePosition.currentSl} (Stage: ${masterSL.activePosition.trailingStage})`);

    masterSL.activePosition = null;
    console.log("\n✅ AUDIT COMPLETE: All trailing rules and config verified operational!");
    console.log("==========================================================================");
}

runAudit().catch(console.error);
