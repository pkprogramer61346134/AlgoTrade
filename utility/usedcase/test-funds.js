const { DhanFunds } = require("../dhan-funds");

async function test() {
    try {
        const funds = new DhanFunds();
        const limits = await funds.getFundLimits();
        console.log("Fund Limits Result:", JSON.stringify(limits, null, 2));
    } catch (error) {
        console.error("ERROR:", error.message);
    }
}

test();
