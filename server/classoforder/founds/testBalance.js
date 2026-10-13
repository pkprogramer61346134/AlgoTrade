// test-dhan-real-balance.js

const dhanBalance = require('./dhan-real-balance');

async function testBalance() {
    try {
        console.log('Fetching REAL balance from Dhan API...\n');

        const balance = await dhanBalance.getBalance();

        console.log('========== DHAN BALANCE TEST ==========');
        console.log('Available Balance:', `₹${balance}`);
        console.log('Test Status: SUCCESS');
        console.log('=======================================');
    } catch (error) {
        console.error('========== DHAN BALANCE TEST ==========');
        console.error('Test Status: FAILED');
        console.error('Error:', error.message);
        console.error('=======================================');
        process.exitCode = 1;
    }
}

testBalance();