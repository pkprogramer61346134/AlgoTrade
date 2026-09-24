const { DhanSDK } = require('../dhanAPI/index');

async function testIdxIChain() {
    const dhan = new DhanSDK();
    const expRes = await dhan.marketData.getOptionChainExpiries(13, 'IDX_I');
    const expList = expRes?.data?.data || expRes?.data;
    console.log("IDX_I Expiries:", expList);

    const ocRes = await dhan.marketData.getOptionChain(13, 'IDX_I', expList[0]);
    const ocMap = ocRes?.data?.data?.oc || ocRes?.data?.oc || ocRes?.oc;

    if (ocMap) {
        const strikes = Object.keys(ocMap).map(Number).sort((a,b) => a-b);
        console.log(`IDX_I: Found ${strikes.length} strikes. Min: ${strikes[0]}, Max: ${strikes[strikes.length-1]}`);
        console.log("Sample strikes:", strikes.filter(s => s >= 23000 && s <= 24500));

        const key23400 = Object.keys(ocMap).find(k => Math.abs(parseFloat(k) - 23400) < 0.1);
        if (key23400) {
            console.log("\nFound 23400 strike details in Dhan Option Chain:");
            console.log("CE:", ocMap[key23400].ce);
            console.log("PE:", ocMap[key23400].pe);

            const ceSecId = ocMap[key23400].ce?.security_id;
            if (ceSecId) {
                console.log(`\nFetching live market quote for CE SecurityID ${ceSecId}...`);
                const quoteRes = await dhan.marketData.getMarketQuote({ 'NSE_FNO': [ceSecId] });
                console.log("Quote Response:", JSON.stringify(quoteRes, null, 2));
            }
        }
    }
}

testIdxIChain();
