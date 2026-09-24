const { DhanSDK } = require('../dhanAPI/index');

async function testRealOptionQuote() {
    try {
        const dhan = new DhanSDK();
        const expiryRes = await dhan.marketData.getOptionChainExpiries(13, 'NSE_FNO');
        const expList = expiryRes?.data?.data || expiryRes?.data || [];
        const nearestExpiry = expList[0];

        const ocRes = await dhan.marketData.getOptionChain(13, 'NSE_FNO', nearestExpiry);
        const ocMap = ocRes?.data?.data?.oc || ocRes?.data?.oc || ocRes?.oc;

        if (ocMap) {
            const strikes = Object.keys(ocMap).map(s => parseFloat(s)).sort((a,b) => a-b);
            console.log("Strikes range:", strikes[0], "to", strikes[strikes.length - 1]);
            const niftyStrikes = strikes.filter(s => s >= 23000 && s <= 24500);
            console.log("Strikes near 23400:", niftyStrikes.slice(0, 10));

            // Find strike 23400
            const key23400 = Object.keys(ocMap).find(k => Math.abs(parseFloat(k) - 23400) < 0.1);
            console.log("Found key for 23400:", key23400);

            if (key23400) {
                const strikeObj = ocMap[key23400];
                console.log("23400 strikeObj:", strikeObj);
                const ceSecId = strikeObj.ce?.security_id;
                const peSecId = strikeObj.pe?.security_id;
                console.log(`CE SecID: ${ceSecId}, PE SecID: ${peSecId}`);

                if (ceSecId) {
                    const quoteRes = await dhan.marketData.getMarketQuote({ 'NSE_FNO': [ceSecId, peSecId] });
                    console.log("Market Quote for CE and PE:", JSON.stringify(quoteRes, null, 2));
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

testRealOptionQuote();
