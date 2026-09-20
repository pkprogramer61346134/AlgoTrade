const PaperTradeManager = require('../order_config/papertrade/paperTradeManager');

async function testPaperTradeSync() {
    console.log("=== Testing Paper Trade Sync with Simulation Engine ===");
    const paperMgr = new PaperTradeManager();

    // Reset Paper Balance to 10,000 for clean test
    paperMgr.resetPaperBalance(10000);
    console.log(`Initial Paper Balance: ₹${paperMgr.paperBalance}`);

    const orderParams = {
        optionSymbol: "NIFTY-2026-09-15-23500-CE",
        optionType: "CE",
        spotPrice: 23500.0,
        spotSL: 23480.0,
        spotTarget: 23540.0,
        atmStrike: 23500,
        optionSecurityId: "47291",
        qty: 65,
        numLots: 1,
        optionPremiumPrice: 120.0,
        optionSL: 110.0,
        target: 136.1,
        rrRatio: 2.0,
        signal: { type: "BUY_SIGNAL" },
        dateStr: "2026-09-20",
        timeStr: "09:50"
    };

    console.log("\n1. Executing Paper Order...");
    const result = paperMgr.executePaperOrder(orderParams);
    console.log("Execution Result:", { status: result.status, mode: result.mode, numLots: result.order?.numLots, qty: result.order?.quantity, entryPrem: result.order?.optionPremiumPrice, SL: result.order?.currentSL, Target: result.order?.target });

    console.log("\n2. Simulating Spot Move UP to ₹23525 (+25 pts spot = +12.5 pts option profit)...");
    const mon1 = paperMgr.monitorPosition(23525.0, 132.5);
    console.log("Monitoring 1 (50% target reached):", {
        currentPrem: paperMgr.activeOrder.currentPremium,
        currentSL: paperMgr.activeOrder.currentSL,
        highestPrem: paperMgr.activeOrder.highestPremium,
        livePnL: paperMgr.activeOrder.pnlRupees,
        exitTriggered: mon1 !== null
    });

    console.log("\n3. Simulating Spot Move BACK DOWN to Entry (Spot ₹23500, Prem ₹120) - Should hit Trailed SL at Breakeven Cost!");
    const mon2 = paperMgr.monitorPosition(23500.0, 120.0);
    console.log("Monitoring 2 (SL hit at breakeven):", mon2);
    console.log(`Final Paper Balance: ₹${paperMgr.paperBalance} (Cost Safe: ₹0 Loss)`);
}

testPaperTradeSync().catch(err => console.error(err));
