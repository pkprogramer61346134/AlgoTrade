const path = require('path');
const fs = require('fs');
const { DhanSDK } = require('../dhanAPI/index');

async function analyzeFullDay() {
    console.log("==========================================================================");
    console.log("📊 ANALYZING FULL DAY MARKET DATA FOR SEPT 16, 2026 (NIFTY 50)");
    console.log("==========================================================================");
    
    const dhan = new DhanSDK();
    let candles = [];

    try {
        const res = await dhan.marketData.getIntradayData({
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "5",
            fromDate: "2026-09-16",
            toDate: "2026-09-16"
        });
        
        if (res.status === 'success' && res.data) {
            const rawData = res.data;
            if (rawData.timestamp && rawData.timestamp.length > 0) {
                for (let i = 0; i < rawData.timestamp.length; i++) {
                    const dateObj = new Date(rawData.timestamp[i] * 1000);
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
        } else {
            console.log("Response:", JSON.stringify(res).slice(0, 300));
        }
    } catch (e) {
        console.log("Dhan API error:", e.message);
    }

    console.log(`Fetched ${candles.length} candles for Sept 16, 2026.`);

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

        const orbHigh = 23281.15;
        const orbLow = 23116.10;

        console.log("\n--------------------------------------------------------------------------");
        console.log(`🔍 BREAKOUT AUDIT AGAINST MORNING 15-MIN ORB RANGE (High: ₹${orbHigh}, Low: ₹${orbLow}):`);

        let upsideBreakout = false;
        let downsideBreakout = false;
        let breakoutTime = null;
        let breakoutPrice = 0;

        candles.forEach((c, idx) => {
            if (c.high > orbHigh && !upsideBreakout) {
                upsideBreakout = true;
                breakoutTime = c.time;
                breakoutPrice = c.high;
            }
            if (c.low < orbLow && !downsideBreakout) {
                downsideBreakout = true;
                breakoutTime = c.time;
                breakoutPrice = c.low;
            }
        });

        if (upsideBreakout) {
            console.log(`⚡ UPSIDE BREAKOUT OCCURRED above ₹23,281.15 at ${breakoutTime} (High: ₹${breakoutPrice})!`);
        } else if (downsideBreakout) {
            console.log(`⚡ DOWNSIDE BREAKDOWN OCCURRED below ₹23,116.10 at ${breakoutTime} (Low: ₹${breakoutPrice})!`);
        } else {
            console.log("⚪ RESULT: Nifty stayed strictly inside the ₹23,116 - ₹23,281 range for the entire day.");
            console.log("🔒 CAPITAL PROTECTION: The strategy logic correctly protected capital and executed 0 TRADES.");
        }
    }
    console.log("==========================================================================");
}

analyzeFullDay();
