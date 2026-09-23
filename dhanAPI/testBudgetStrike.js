const DhanOptionStrikeFetcher = require('./optionStrikeFetcher');
const { ensureValidDhanToken } = require('./autoTokenRefresh');

async function runTest() {
    console.log('Refreshing Dhan Access Token...');
    await ensureValidDhanToken(true);

    const fetcher = new DhanOptionStrikeFetcher();
    const spotPrice = 23430.0;
    const accountBalance = 750.99;

    console.log(`Testing resolveOptionStrike with spot ₹${spotPrice} and balance ₹${accountBalance}...`);
    try {
        const ceResult = await fetcher.resolveOptionStrike(spotPrice, 'CE', accountBalance);
        console.log(`✅ CE Strike Resolved:`, ceResult);
        console.log(`   Margin Required: ₹${(ceResult.liveLtp * 50).toFixed(2)} <= Available ₹${accountBalance}`);

        const peResult = await fetcher.resolveOptionStrike(spotPrice, 'PE', accountBalance);
        console.log(`✅ PE Strike Resolved:`, peResult);
        console.log(`   Margin Required: ₹${(peResult.liveLtp * 50).toFixed(2)} <= Available ₹${accountBalance}`);
    } catch (e) {
        console.error(`❌ Error:`, e.message);
    }
}

runTest();
