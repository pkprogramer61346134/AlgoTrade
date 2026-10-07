const masterSL = require("../server/masterSL/masterSL");

async function test5SecSpikeTrailing() {
    console.log("=== TESTING 5-SECOND SPIKE TRAILING SL & ZERO-MISS PROTECTION ===");
    masterSL.activePosition = null;

    // Simulated Position Opened at ₹56.20
    masterSL.activePosition = {
        tradeId: "TEST_SPIKE_101",
        symbol: "NIFTY_22650_CE",
        securityId: "40704",
        optionType: "CE",
        isOptionTrade: true,
        entryPrice: 56.20,
        initialSl: 51.48,
        currentSl: 51.48,
        targetPrice: 209.95,
        targetPoints: 153.75,
        qty: 65,
        lotSize: 65,
        status: "OPEN",
        trailingStage: "INITIAL",
        envName: "TEST_ENV",
        handlers: {
            closeOrder: async (pos) => {
                console.log(`✅ [TEST BROKER EXIT] Market Exit Executed @ ₹${pos.exitPrice} (${pos.exitReason})`);
                return true;
            },
            verifyOrderClose: async (secId, orderId) => ({ isClosedOnTerminal: true })
        }
    };

    console.log(`📌 Initial Active Position: Entry ₹56.20 | SL ₹51.48`);

    // Tick 1 (14:32:00): Live LTP is 60.00, 5-second bucket candleHigh recorded 61.70 spike, candleLow 60.00
    console.log("\n⚡ Tick 1 Arrives: liveLtp = ₹60.00 | candleHigh (5s bucket) = ₹61.70 | candleLow = ₹60.00");
    await masterSL.processTick({
        status: "live",
        securityId: "40704",
        time: "14:32:00",
        liveLtp: 60.00,
        price: 60.00,
        high: 61.70,
        candleHigh: 61.70,
        low: 60.00,
        candleLow: 60.00
    }, "TEST_ENV");

    console.log(`📌 Post Tick 1 SL State: currentSl = ₹${masterSL.activePosition?.currentSl} | Stage = ${masterSL.activePosition?.trailingStage}`);

    // Tick 2 (14:32:01): 1s later, price pulls back to ₹58.00 (below new trailed SL ₹59.28)
    console.log("\n🔻 Tick 2 Arrives (1s later): liveLtp = ₹58.00 (Pullback below trailed SL ₹59.28)");
    const closedPos = await masterSL.processTick({
        status: "live",
        securityId: "40704",
        time: "14:32:01",
        liveLtp: 58.00,
        price: 58.00,
        high: 58.00,
        candleHigh: 58.00,
        low: 58.00,
        candleLow: 58.00
    }, "TEST_ENV");

    if (closedPos && closedPos.status === "CLOSED") {
        console.log(`\n🎉 SUCCESS! Position Closed @ ₹${closedPos.exitPrice} | Reason: ${closedPos.exitReason} | Realized PnL: +₹${closedPos.realizedPnl}`);
        console.log("5-Second Spike Trailing SL Protection PASSED 100%!");
    } else {
        console.error("❌ TEST FAILED: Position was not closed properly");
    }
}

test5SecSpikeTrailing();
