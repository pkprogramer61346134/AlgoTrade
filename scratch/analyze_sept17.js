const { DhanSDK } = require('../dhanAPI/index');

async function analyzeSept17() {
    console.log("==========================================================================");
    console.log("📊 FULL DAY MARKET DATA AUDIT FOR TODAY (SEPT 17, 2026 - NIFTY 50)");
    console.log("==========================================================================");
    
    const dhan = new DhanSDK();
    let candles = [];

    try {
        const res = await dhan.marketData.getIntradayData({
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "5",
            fromDate: "2026-09-17",
            toDate: "2026-09-17"
        });
        
        const rawData = res?.data || res;
        if (rawData && Array.isArray(rawData.open)) {
            for (let i = 0; i < rawData.open.length; i++) {
                const ts = rawData.timestamp[i];
                const dateObj = new Date(ts * 1000);
                const timeStr = dateObj.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
                candles.push({
                    time: timeStr,
                    open: rawData.open[i],
                    high: rawData.high[i],
                    low: rawData.low[i],
                    close: rawData.close[i],
                    volume: rawData.volume ? rawData.volume[i] : 0
                });
            }
        }
    } catch (e) {
        console.log("Error:", e.message);
    }

    console.log(`Fetched ${candles.length} candles for Sept 17, 2026.`);

    if (candles.length > 0) {
        let dayHigh = 0;
        let dayLow = 999999;
        let dayOpen = candles[0]?.open || 0;
        let dayClose = candles[candles.length - 1]?.close || 0;

        candles.forEach((c) => {
            if (c.high > dayHigh) dayHigh = c.high;
            if (c.low < dayLow) dayLow = c.low;
        });

        console.log(`- Day Open  : ₹${dayOpen}`);
        console.log(`- Day High  : ₹${dayHigh}`);
        console.log(`- Day Low   : ₹${dayLow}`);
        console.log(`- Day Close : ₹${dayClose}`);
        
        // ORB 15-min range (first 3 candles 9:15-9:30)
        const orbCandles = candles.slice(0, 3);
        const orbHigh = Math.max(...orbCandles.map(c => c.high));
        const orbLow = Math.min(...orbCandles.map(c => c.low));
        console.log(`- Morning 15-Min ORB Range (9:15-9:30 AM) : High = ₹${orbHigh}, Low = ₹${orbLow}`);

        console.log("\n--------------------------------------------------------------------------");
        console.log(`🔍 BREAKOUT TIMELINE FOR TODAY (SEPT 17):`);
        candles.forEach((c) => {
            if (c.high > orbHigh) {
                console.log(`  👉 ${c.time}: Candle High ₹${c.high} broke ORB High ₹${orbHigh}! Spot Close: ₹${c.close}`);
            }
        });
    }
    console.log("==========================================================================");
}

analyzeSept17();
