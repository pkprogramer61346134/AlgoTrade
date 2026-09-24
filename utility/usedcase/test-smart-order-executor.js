const { SmartOrderExecutor } = require("../usedfull/smart-order-executor");

async function test() {
    try {
        const executor = new SmartOrderExecutor();

        console.log("================ 1. GET LIVE ACTIVE POSITIONS & SERVER PnL ================");
        const activePos = await executor.getLiveActivePosition();
        console.log("Live Active Positions Result:", JSON.stringify(activePos, null, 2));

        console.log("\n================ 2. PLACE OPTION ORDER (WITH TARGET & STOPLOSS) ================");
        const orderParams = {
            securityId: "74003", // Nifty 23600 CE
            exchangeSegment: "NSE_FNO",
            transactionType: "BUY",
            lots: 1,
            lotSize: 65,
            price: 10.30,       // Limit Entry Price
            targetPrice: 20.00,  // Target TR (Take Profit)
            stopLossPrice: 5.00  // StopLoss SL
        };
        console.log("Placing Order with Params:", orderParams);

        const placeRes = await executor.placeOptionOrder(orderParams);
        console.log("Place Order Result:", JSON.stringify(placeRes, null, 2));

        console.log("\n================ 3. UPDATE STOP LOSS (SL) ================");
        const slUpdateRes = await executor.updateStopLoss({
            orderId: placeRes.orderId || "SUPER_TEST_123",
            newStopLossPrice: 7.50,
            quantity: 65,
            price: 10.30
        });
        console.log("Update SL Result:", JSON.stringify(slUpdateRes, null, 2));

        console.log("\n================ 4. UPDATE TARGET (TR) ================");
        const trUpdateRes = await executor.updateTarget({
            orderId: placeRes.orderId || "SUPER_TEST_123",
            newTargetPrice: 25.00,
            quantity: 65
        });
        console.log("Update TR Result:", JSON.stringify(trUpdateRes, null, 2));

    } catch (error) {
        console.error("ERROR:", error.message);
    }
}

test();
