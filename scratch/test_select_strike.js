const SelectStrikePriceBasedOnBalance = require('../ordermanager/selectestrikpricebaseofbalalace');

async function testStrikeSelection() {
    const selector = new SelectStrikePriceBasedOnBalance();
    try {
        console.log("Testing SelectStrikePriceBasedOnBalance module...");
        const result = await selector.selectStrike(23200, 'PE', 10000);
        console.log("Test Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Test Error:", e.message);
    }
}

testStrikeSelection();
