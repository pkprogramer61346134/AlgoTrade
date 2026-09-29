const { getCandlesBefore } = require("../usedfull/cached-historical-data");

async function runTest() {
    console.log("================ FETCHING 200 CANDLES UP TO TODAY 10:35:00 ================");
    
    // Pass null for date so it automatically picks today's date ("2026-09-29")
    const res = await getCandlesBefore(null, "10:35:00", 200, {
        securityId: 13,
        interval: "5"
    });

    console.log("\nStatus:", res.status);
    console.log("Requested Count:", res.requestedCount);
    console.log("Total Candles Returned:", res.totalCandles);
    console.log("Target Cutoff Date & Time:", res.targetDate, res.targetTime);
    console.log("Data Source:", res.source);

    console.log("\n--- FIRST 5 CANDLES (OLDEST) ---");
    console.table(res.data.slice(0, 5).map(c => ({
        index: c.index,
        date: c.date,
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
    })));

    console.log("\n--- LAST 5 CANDLES (NEWEST UP TO 10:35) ---");
    console.table(res.data.slice(-5).map(c => ({
        index: c.index,
        date: c.date,
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
    })));
}

runTest();
