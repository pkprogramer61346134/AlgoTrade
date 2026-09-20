async function testSimulatorApi() {
    console.log("===================================================================================");
    console.log("🧪 [VERIFICATION] Testing Tick-by-Tick Simulator Endpoints");
    console.log("===================================================================================\n");

    const initRes = await fetch('http://localhost:3000/api/simulator/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '2026-09-11', initialCapital: 10000 })
    });
    const initData = await initRes.json();
    console.log("✅ SIMULATOR INIT RESPONSE:", {
        success: initData.success,
        targetDate: initData.targetDate,
        totalCandles: initData.totalCandles
    });

    // Step through candles until 11:15 AM
    let currentCap = 10000;
    let activeTrade = null;
    let dailyTradeCount = 0;

    for (let cIdx = 0; cIdx < initData.dayCandles.length; cIdx++) {
        const stepRes = await fetch('http://localhost:3000/api/simulator/step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetDate: initData.targetDate,
                globalIndex: initData.dayIndices[cIdx],
                runningCapital: currentCap,
                activeTrade,
                dailyTradeCount
            })
        });
        const stepData = await stepRes.json();
        
        currentCap = stepData.updatedCapital;
        activeTrade = stepData.updatedActiveTrade;
        dailyTradeCount = stepData.dailyTradeCount;

        if (stepData.tradeEnteredEvent) {
            console.log(`🚀 [${stepData.timeStr}] SIMULATOR TRADE ENTERED: ${stepData.tradeEnteredEvent.optionType} @ Spot ₹${stepData.tradeEnteredEvent.spotEntryPrice} (${stepData.tradeEnteredEvent.numLots} Lot / ${stepData.tradeEnteredEvent.quantity} Qty). Votes: ${stepData.tradeEnteredEvent.consensusVotes}/16`);
        }

        if (stepData.tradeClosedEvent) {
            console.log(`🏁 [${stepData.timeStr}] SIMULATOR TRADE CLOSED: PnL: ₹${stepData.tradeClosedEvent.pnlRupees} (${stepData.tradeClosedEvent.pnlPoints} pts). Reason: ${stepData.tradeClosedEvent.exitReason}`);
        }
    }

    console.log("\n===================================================================================");
    console.log(`🏆 SIMULATION COMPLETE FOR 2026-09-11: Final Balance: ₹${currentCap}`);
    console.log("===================================================================================");
}

testSimulatorApi().catch(console.error);
