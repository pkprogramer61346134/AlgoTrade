const strikeSelector = require('./strike-price-selector');

async function testStrikePrice() {
    try {
        const stockInfo = {
            securityId: 13,
            exchangeSegment: 'IDX_I'
        };

        const amount = 14000;
        const optionType = 'CE';
        const spotPrice = 25000;

        console.log('Testing Best Strike Price Selection...\n');

        const result = await strikeSelector.getBestStrike(
            stockInfo,
            amount,
            optionType,
            spotPrice
        );

        console.log('========== STRIKE PRICE TEST ==========');
        console.log('Stock Info:', stockInfo);
        console.log('Spot Price:', spotPrice);
        console.log('Option Type:', optionType);
        console.log('Budget:', `₹${amount}`);
        console.log('Result:', result);
        console.log('Test Status: SUCCESS');
        console.log('=======================================');
    } catch (error) {
        console.error('========== STRIKE PRICE TEST ==========');
        console.error('Test Status: FAILED');
        console.error('Error:', error.message);
        console.error('=======================================');
        process.exitCode = 1;
    }
}

testStrikePrice();