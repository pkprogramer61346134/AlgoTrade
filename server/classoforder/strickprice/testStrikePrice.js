/**
 * Test script for Strike Price Selector
 * Location: C:\AlgoTrade\server\classoforder\strickprice\testStrikePrice.js
 *
 * चलाओ: node server/classoforder/strickprice/testStrikePrice.js
 */

const strikeSelector = require('./strike-price-selector');

async function testStrikePrice() {
    try {
        const stockInfo = {
            securityId: 13,
            exchangeSegment: 'IDX_I'
        };

        const amount = 14000;
        const optionType = 'CE';
        const spotPrice = 22721;

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
        console.log('---');
        console.log('Result:', result);
        console.log('---');
        console.log('Delta        :', result.delta);
        console.log('Delta Source :', result.deltaSource || 'LIVE');
        console.log('Selected     :', `${result.selectedStrike} ${result.optionType} @ ₹${result.liveLtp}`);
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