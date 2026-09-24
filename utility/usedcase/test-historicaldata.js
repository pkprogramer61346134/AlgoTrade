const { HistoricalData } = require("../historicaldata");

async function test() {
    try {
        const history = new HistoricalData();

        const data = await history.getHistoricalData({
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "15",
            fromDate: "2026-09-24",
            toDate: "2026-09-24"
        });

        console.log("Total Candles:", data.length);
        console.log(JSON.stringify(data, null, 2));

    } catch (error) {
        console.error("ERROR:", error.message);
    }
}

test();