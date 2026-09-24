const { getCachedCandles } = require("../usedfull/cached-historical-data");

async function test() {
    try {
        console.log("================ 1. TEST SINGLE-DAY DATE RANGE MODE (fromDate: '2026-09-23' to toDate: '2026-09-23') ================");
        const dateRangeResult1 = await getCachedCandles({
            securityId: 13,
            exchangeSegment: "IDX_I",
            interval: "5",
            fromDate: "2026-09-23",
            toDate: "2026-09-23"
        });
        console.log("Single-Day Call Source:", dateRangeResult1.source);
        console.log("Total Candles Loaded:", dateRangeResult1.totalCandles);

        console.log("\n================ 2. TEST MULTI-DAY DATE RANGE MODE (fromDate: '2026-09-21' to toDate: '2026-09-23') ================");
        const multiDateResult = await getCachedCandles({
            securityId: 13,
            exchangeSegment: "IDX_I",
            interval: "5",
            fromDate: "2026-09-21",
            toDate: "2026-09-23"
        });
        console.log("Multi-Day Call Source:", multiDateResult.source);
        console.log("Total Candles Loaded:", multiDateResult.totalCandles);
        if (multiDateResult.data.length > 0) {
            console.log("First Candle in range:", multiDateResult.data[0].date, multiDateResult.data[0].time);
            console.log("Last Candle in range:", multiDateResult.data[multiDateResult.data.length - 1].date, multiDateResult.data[multiDateResult.data.length - 1].time);
        }

        console.log("\n================ 3. TEST CANDLE COUNT MODE WITH TARGET DATE ('2026-09-23') ================");
        const countResult200Date = await getCachedCandles({
            securityId: 13,
            exchangeSegment: "IDX_I",
            interval: "5",
            count: 200,
            date: "2026-09-23"
        });
        console.log("Count Mode Status:", countResult200Date.status);
        console.log("Total Candles Returned:", countResult200Date.totalCandles);
        if (countResult200Date.data.length > 0) {
            console.log("First Candle in list:", countResult200Date.data[0].date, countResult200Date.data[0].time);
            console.log("Last Candle in list:", countResult200Date.data[countResult200Date.data.length - 1].date, countResult200Date.data[countResult200Date.data.length - 1].time);
        }

        console.log("\n================ 4. TEST CANDLE COUNT MODE WITH TARGET DATE & TIME ('2026-09-23' up to '1:30:00 pm') ================");
        const countResult200DateTime = await getCachedCandles({
            securityId: 13,
            exchangeSegment: "IDX_I",
            interval: "5",
            count: 200,
            date: "2026-09-23",
            time: "1:30:00 pm"
        });
        console.log("Count Mode Status:", countResult200DateTime.status);
        console.log("Total Candles Returned:", countResult200DateTime.totalCandles);
        if (countResult200DateTime.data.length > 0) {
            console.log("First Candle in list:", countResult200DateTime.data[0].date, countResult200DateTime.data[0].time);
            console.log("Last Candle in list:", countResult200DateTime.data[countResult200DateTime.data.length - 1].date, countResult200DateTime.data[countResult200DateTime.data.length - 1].time);
        }

    } catch (error) {
        console.error("ERROR:", error.message);
    }
}

test();
