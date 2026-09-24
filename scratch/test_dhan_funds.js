const { DhanSDK } = require('../dhanAPI/index');

async function testDhanFunds() {
    try {
        const dhan = new DhanSDK();
        console.log("Calling Dhan Funds API (getFundLimits)...");
        const fundRes = await dhan.funds.getFundLimits();
        console.log("Dhan Funds API Raw Response:", JSON.stringify(fundRes, null, 2));

        if (fundRes && fundRes.status === 'success' && fundRes.data) {
            const availBal = Number(fundRes.data.availabelBalance || fundRes.data.availableBalance || 0);
            console.log(`✅ Real Dhan Available Balance: ₹${availBal}`);
        } else {
            console.error("Failed to fetch funds:", fundRes);
        }
    } catch (e) {
        console.error("Error calling Dhan Funds API:", e);
    }
}

testDhanFunds();
