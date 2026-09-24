const DhanOptionStrikeFetcher = require('../dhanAPI/optionStrikeFetcher');

async function testOptionFetcher() {
    try {
        const fetcher = new DhanOptionStrikeFetcher();
        const spotPrice = 23436.50;
        console.log(`Testing strike resolution for Nifty spot: ${spotPrice} (BUY Signal - CALL)...`);

        const ceDetails = await fetcher.resolveOptionStrike(spotPrice, 'CE');
        console.log("CE Strike Details from Dhan API:", ceDetails);

        console.log(`\nTesting strike resolution for Nifty spot: ${spotPrice} (SELL Signal - PUT)...`);
        const peDetails = await fetcher.resolveOptionStrike(spotPrice, 'PE');
        console.log("PE Strike Details from Dhan API:", peDetails);

        console.log("\nTesting live LTP update for active CE strike...");
        const liveCeLtp = await fetcher.fetchLiveOptionLtp(ceDetails.strikePrice, 'CE', ceDetails.securityId);
        console.log(`Refreshed Real Live CE LTP: ₹${liveCeLtp}`);

    } catch (e) {
        console.error("Test failed with error:", e.message);
    }
}

testOptionFetcher();
