const path = require('path');
const fs = require('fs');
const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');

function inspectTodayCandles() {
    console.log("==========================================================================");
    console.log("🔍 INSPECTING TODAY (SEPT 11) CANDLE DATA IN C:\\candle data");
    console.log("==========================================================================");

    const allCandles = loadAllCandlesFromDir('C:\\candle data') || [];
    const todayCandles = allCandles.filter(c => c.date === '2026-09-11' || c.date === '2026-09-11T00:00:00.000Z');

    console.log(`Total Candles in Disk Cache : ${allCandles.length}`);
    console.log(`Today's Candles Count       : ${todayCandles.length}`);

    if (todayCandles.length > 0) {
        console.log("\nFirst 5 Candles of Today (ORB Range Calculation):");
        todayCandles.slice(0, 5).forEach((c, idx) => {
            console.log(` Candle #${idx+1} [${c.time}]: Open ₹${c.open}, High ₹${c.high}, Low ₹${c.low}, Close ₹${c.close}`);
        });

        const orbHigh = Math.max(...todayCandles.slice(0, 3).map(c => c.high));
        const orbLow = Math.min(...todayCandles.slice(0, 3).map(c => c.low));
        console.log(`\nComputed ORB High (First 15m) : ₹${orbHigh}`);
        console.log(`Computed ORB Low (First 15m)  : ₹${orbLow}`);

        const lastC = todayCandles[todayCandles.length - 1];
        console.log(`\nLast Candle [${lastC.time}]: Close ₹${lastC.close}`);
    } else {
        console.log("⚠️ No candles for 2026-09-11 found in disk cache. Showing last 5 candles of dataset:");
        allCandles.slice(-5).forEach(c => {
            console.log(` [${c.date} ${c.time}]: Open ₹${c.open}, High ₹${c.high}, Low ₹${c.low}, Close ₹${c.close}`);
        });
    }
    console.log("==========================================================================");
}

inspectTodayCandles();
