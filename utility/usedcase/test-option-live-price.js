const { DhanOptionLivePrice } = require("../dhan-option-live-price");
const { selectBestStrike } = require("../usedfull/select-best-strike");

async function test() {
    try {
        console.log("Step 1: Selecting Best Option Strike...");
        const selected = await selectBestStrike({
            securityId: 13,
            optionType: "CE",
            lots: 1,
            amountPercent: "100%"
        });

        console.log("Selected Contract:", {
            symbol: selected.symbol,
            securityId: selected.securityId,
            strike: selected.selectedStrike,
            liveLtp: selected.liveLtp
        });

        console.log("\nStep 2: Connecting to Live Dhan WebSocket for Option Strike Price & Live PnL...");
        const liveOptionTracker = new DhanOptionLivePrice();

        let tickCount = 0;

        liveOptionTracker.streamOptionLtp({
            securityId: selected.securityId,
            exchangeSegment: "NSE_FNO",
            buyPrice: selected.liveLtp, // Simulating buy entry price
            qty: selected.totalQty       // 1 Lot = 65 Qty
        }, (tickData) => {
            tickCount++;
            console.log(`\n[Tick #${tickCount}] Live Option Update:`, tickData);

            if (tickCount >= 3) {
                console.log("\nReceived 3 ticks. Closing live stream test...");
                liveOptionTracker.close();
                process.exit(0);
            }
        });

    } catch (error) {
        console.error("ERROR:", error.message);
    }
}

test();
