const { DhanSDK } = require('../dhanAPI/index');

async function findNiftyUnderlyingId() {
    const dhan = new DhanSDK();
    // Test common index underlying security IDs: 13, 25, 1, 2, 51, 100, 101, etc.
    const testIds = [13, 25, 1, 2, 51, 100, 5001, 11, 12, 14, 15, 10001];
    for (const id of testIds) {
        try {
            const expRes = await dhan.marketData.getOptionChainExpiries(id, 'NSE_FNO');
            const expList = expRes?.data?.data || expRes?.data;
            if (Array.isArray(expList) && expList.length > 0) {
                const ocRes = await dhan.marketData.getOptionChain(id, 'NSE_FNO', expList[0]);
                const ocMap = ocRes?.data?.data?.oc || ocRes?.data?.oc || ocRes?.oc;
                if (ocMap) {
                    const keys = Object.keys(ocMap).map(Number).sort((a, b) => a - b);
                    console.log(`SecurityID ${id}: Found ${keys.length} strikes. Min: ${keys[0]}, Max: ${keys[keys.length-1]}`);
                }
            }
        } catch (e) {}
    }
}

findNiftyUnderlyingId();
