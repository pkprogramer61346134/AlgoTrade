const { HistoricalData } = require("../utility/historicaldata");

async function fetchOptionIntradayData() {
    const hd = new HistoricalData();

    try {
        const res = await hd.getHistoricalData({
            securityId: "40704",
            exchangeSegment: "NSE_FNO",
            instrument: "OPTIDX",
            interval: "1",
            fromDate: "2026-10-06",
            toDate: "2026-10-06"
        });

        console.log("Is Array?", Array.isArray(res));
        console.log("Length:", res?.length);
        if (Array.isArray(res) && res.length > 0) {
            console.log("Sample candle [0]:", res[0]);
            console.log("Sample candle [last]:", res[res.length - 1]);

            const formatted = res.map((c, idx) => ({
                idx,
                time: c.time || c.date || `Index_${idx}`,
                open: c.candleOpen || c.open,
                high: c.candleHigh || c.high,
                low: c.candleLow || c.low,
                close: c.candleClose || c.close,
                pnlAtHigh: Math.round(((c.candleHigh || c.high) - 56.10) * 65),
                pnlAtLow: Math.round(((c.candleLow || c.low) - 56.10) * 65)
            }));

            // Filter around 14:30 to 15:10
            const after230 = formatted.filter(c => c.time.includes("14:3") || c.time.includes("14:4") || c.time.includes("14:5") || c.time.includes("15:0") || c.time.includes("2:3") || c.time.includes("2:4") || c.time.includes("2:5") || c.time.includes("3:0"));
            
            console.log("\nOption Price Ticks (NIFTY_22650_CE) from 14:30 to 15:10:");
            console.table(after230);
        }
    } catch (err) {
        console.error("Error fetching option candles:", err.message);
    }
}

fetchOptionIntradayData();
