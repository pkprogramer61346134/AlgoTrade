const { DhanSDK } = require('../dhanAPI/index');

async function inspectOptionChain() {
    const dhan = new DhanSDK();
    const expiryRes = await dhan.marketData.getOptionChainExpiries(13, 'NSE_FNO');
    const nearestExpiry = (expiryRes?.data?.data || expiryRes?.data || [])[0];
    console.log("Nearest Expiry:", nearestExpiry);

    const ocRes = await dhan.marketData.getOptionChain(13, 'NSE_FNO', nearestExpiry);
    const ocMap = ocRes?.data?.data?.oc || ocRes?.data?.oc || ocRes?.oc;

    if (ocMap) {
        const keys = Object.keys(ocMap);
        console.log("First 10 Keys in ocMap:", keys.slice(0, 10));
        const sampleKey = keys[0];
        console.log("Sample Item:", ocMap[sampleKey]);
    } else {
        console.log("Full ocRes:", JSON.stringify(ocRes, null, 2));
    }
}

inspectOptionChain();
