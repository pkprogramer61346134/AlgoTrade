const { DhanSDK } = require('../dhanAPI/index');

async function testRealSecurityQuotes() {
    const dhan = new DhanSDK();
    console.log("Fetching live market quotes for real NIFTY Option Security IDs from Dhan API...");

    const testSecIds = [47295, 47296, 47297, 47305, 47309];
    const payload = [
        { exchangeSegment: 'NSE_FNO', securityId: 47295 },
        { exchangeSegment: 'NSE_FNO', securityId: 47296 },
        { exchangeSegment: 'NSE_FNO', securityId: 47297 },
        { exchangeSegment: 'NSE_FNO', securityId: 47305 },
        { exchangeSegment: 'NSE_FNO', securityId: 47309 }
    ];

    try {
        const quoteRes = await dhan.marketData.getMarketQuote(payload);
        console.log("Quote Result Status:", quoteRes.status, quoteRes.statusCode);
        console.log("Quote Data:", JSON.stringify(quoteRes.data, null, 2));
    } catch (e) {
        console.error("Quote Error:", e.message);
    }
}

testRealSecurityQuotes();
