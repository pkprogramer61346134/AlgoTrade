const DhanOptionStrikeFetcher = require('../dhanAPI/optionStrikeFetcher');

async function testBudgetStrike() {
    const fetcher = new DhanOptionStrikeFetcher();
    const spotPrice = 23430.0;

    console.log(`--- Test 1: Balance = ₹6,000 ---`);
    try {
        const ce6k = await fetcher.resolveOptionStrike(spotPrice, 'CE', 6000);
        console.log(`✅ CE (₹6,000 bal):`, ce6k.symbol, `@ ₹${ce6k.liveLtp}`);
        const pe6k = await fetcher.resolveOptionStrike(spotPrice, 'PE', 6000);
        console.log(`✅ PE (₹6,000 bal):`, pe6k.symbol, `@ ₹${pe6k.liveLtp}`);
    } catch (e) {
        console.error(`❌ Error 6k:`, e.message);
    }

    console.log(`\n--- Test 2: Balance = ₹750.99 ---`);
    try {
        const ce750 = await fetcher.resolveOptionStrike(spotPrice, 'CE', 750.99);
        console.log(`✅ CE (₹750 bal):`, ce750.symbol, `@ ₹${ce750.liveLtp}`);
        const pe750 = await fetcher.resolveOptionStrike(spotPrice, 'PE', 750.99);
        console.log(`✅ PE (₹750 bal):`, pe750.symbol, `@ ₹${pe750.liveLtp}`);
    } catch (e) {
        console.error(`❌ Error 750:`, e.message);
    }
}

testBudgetStrike();
