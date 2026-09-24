const { DhanMarketData } = require("../dhan-market-data");

async function test() {
    try {
        const marketData = new DhanMarketData();

        // 10 Strikes Below ATM & 10 Strikes Above ATM (Total 21 Strikes)
        const result = await marketData.getNearAtmOptionChain(13, "IDX_I", 10, 10);

        if (result.status !== "success") {
            console.error("Failed:", result.message);
            return;
        }

        console.log(`📅 Current Expiry: ${result.currentExpiry}`);
        console.log(`📈 Nifty Spot Price: ₹${result.spotPrice}`);
        console.log(`🎯 ATM Strike Price: ${result.atmStrike}`);
        console.log(`🔢 Total Strikes Fetched: ${result.strikesCount} (10 Below + ATM + 10 Above)`);

        console.log("\n================ LIVE 21 NEAR-ATM OPTION STRIKES (10 BELOW / 10 ABOVE) ================");
        result.strikes.forEach(({ strike, isAtm, ce, pe }) => {
            const tag = isAtm ? " ⭐ [ATM STRIKE]" : "";
            console.log(`\n🎯 Strike Price: ${strike}${tag}`);
            console.log(`   🟢 CALL (CE) [ID: ${ce.securityId}] -> LTP: ₹${ce.ltp} | Bid: ₹${ce.bid} | Ask: ₹${ce.ask} | Delta: ${ce.delta}`);
            console.log(`   🔴 PUT  (PE) [ID: ${pe.securityId}] -> LTP: ₹${pe.ltp} | Bid: ₹${pe.bid} | Ask: ₹${pe.ask} | Delta: ${pe.delta}`);
        });

    } catch (error) {
        console.error("ERROR:", error.message);
    }
}

test();
