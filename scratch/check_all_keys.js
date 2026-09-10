const { DhanSDK } = require('../dhanAPI/index');

async function checkAllKeys() {
    const dhan = new DhanSDK();
    const expiryRes = await dhan.marketData.getOptionChainExpiries(13, 'NSE_FNO');
    const nearestExpiry = (expiryRes?.data?.data || expiryRes?.data || [])[0];

    const ocRes = await dhan.marketData.getOptionChain(13, 'NSE_FNO', nearestExpiry);
    const ocMap = ocRes?.data?.data?.oc || ocRes?.data?.oc || ocRes?.oc;

    if (ocMap) {
        const keys = Object.keys(ocMap).map(Number).sort((a, b) => a - b);
        console.log("All Strike Keys:", keys);
    }
}

checkAllKeys();
