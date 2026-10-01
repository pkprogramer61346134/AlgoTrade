/**
 * Inspect Specific Strikes in Raw Option Chain Matrix
 * Path: scratch/inspect_option_chain.js
 */

const { DhanMarketData } = require('../utility/dhan-market-data');

async function inspectStrikes() {
    const marketData = new DhanMarketData();
    const currentExpiry = await marketData.getCurrentExpiry(13, "IDX_I");
    const ocRes = await marketData.getOptionChain(13, "IDX_I", currentExpiry);
    const ocDataObj = ocRes.data?.data || ocRes.data || {};
    const ocMap = ocDataObj.oc || ocDataObj.optionChain || {};

    const targetStrikes = ["22600.000000", "22650.000000", "22700.000000", "22750.000000", "22800.000000"];

    for (const k of targetStrikes) {
        if (ocMap[k]) {
            console.log(`\n--- Strike ${k} ---`);
            console.log("CE Data:", JSON.stringify(ocMap[k].ce, null, 2));
        }
    }
}

inspectStrikes().catch(err => console.error(err));
