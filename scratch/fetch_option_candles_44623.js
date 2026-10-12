const { HistoricalData } = require("../utility/historicaldata");

async function fetchOptionIntradayData() {
    const hd = new HistoricalData();

    try {
        const res = await hd.getHistoricalData({
            securityId: "44623",
            exchangeSegment: "NSE_FNO",
            instrument: "OPTIDX",
            interval: "1",
            fromDate: "2026-10-12",
            toDate: "2026-10-12"
        });

        console.log("Is Array?", Array.isArray(res));
        console.log("Length:", res?.length);
        if (Array.isArray(res) && res.length > 0) {
            const formatted = res.map((c, idx) => ({
                idx,
                time: c.time || c.date || `Index_${idx}`,
                open: c.candleOpen || c.open,
                high: c.candleHigh || c.high,
                low: c.candleLow || c.low,
                close: c.candleClose || c.close,
                volume: c.candleVolume || c.volume
            }));

            // Filter around 09:15 to 09:40
            const morning = formatted.filter(c => c.time.includes("09:") || c.time.includes("9:"));
            console.log("\n1-Minute Candles for 44623 (NIFTY 22750 PE) on 2026-10-12:");
            console.table(morning);
        }
    } catch (err) {
        console.error("Error fetching option candles:", err.message);
    }
}

fetchOptionIntradayData();
