const { DhanSDK } = require('../dhanAPI/index');
const dhan = new DhanSDK();

async function testFetchTodayNifty() {
    console.log("==========================================================================");
    console.log("📡 FETCHING TODAY'S (SEPT 11) REAL 5-MIN CANDLES FROM DHAN API");
    console.log("==========================================================================");

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    console.log(`Target Date: ${todayStr}`);

    try {
        const res = await dhan.marketData.getIntradayData({
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "5",
            fromDate: todayStr,
            toDate: todayStr
        });

        console.log("Raw Response Status:", res.status, res.statusCode);
        const rootData = res?.data?.data || res?.data || res;
        console.log("Keys in response:", Object.keys(rootData));

        if (rootData.start_time || rootData.open) {
            console.log(`✅ Success! Received ${rootData.open?.length} candles for today from Dhan API.`);
            console.log(`First Candle Open: ₹${rootData.open[0]}, High: ₹${rootData.high[0]}, Low: ₹${rootData.low[0]}, Close: ₹${rootData.close[0]}`);
            console.log(`Last Candle Open: ₹${rootData.open[rootData.open.length-1]}, High: ₹${rootData.high[rootData.high.length-1]}, Low: ₹${rootData.low[rootData.low.length-1]}, Close: ₹${rootData.close[rootData.close.length-1]}`);
        } else {
            console.log("Response structure:", JSON.stringify(res, null, 2));
        }
    } catch (e) {
        console.error("Error fetching today's candles:", e.message);
    }
    console.log("==========================================================================");
}

testFetchTodayNifty();
