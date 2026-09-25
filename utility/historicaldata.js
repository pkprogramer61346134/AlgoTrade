const config = require("./token/config");

class HistoricalData {
    constructor(options = {}) {
        this.clientId = options.clientId || config.CLIENT_ID;
        this.accessToken = options.accessToken || config.ACCESS_TOKEN;
        this.baseUrl = options.baseUrl || config.BASE_URL;
    }

    async getHistoricalData({
        securityId,
        exchangeSegment,
        instrument,
        interval = "5",
        fromDate,
        toDate
    }) {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const reqFromDate = fromDate || today;
        const reqToDate = toDate || reqFromDate;

        const response = await fetch(
            `${this.baseUrl}/charts/intraday`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "access-token": this.accessToken,
                    "client-id": this.clientId
                },

                body: JSON.stringify({
                    securityId: String(securityId),
                    exchangeSegment,
                    instrument,
                    interval: String(interval),
                    fromDate: reqFromDate,
                    toDate: reqToDate,
                    oi: false
                })
            }
        );

        const result = await response.json();

        // API error
        if (!response.ok) {
            throw new Error(
                result?.remarks?.error_message ||
                result?.message ||
                "Dhan historical data API failed"
            );
        }

        // No candle data
        if (!result?.timestamp) {
            return [];
        }

        const candles = [];

        for (let i = 0; i < result.timestamp.length; i++) {

            const timestamp = result.timestamp[i];
            const dateObj = new Date(timestamp * 1000);

            // Time check in Kolkata timezone
            const timeParts = new Intl.DateTimeFormat("en-US", {
                timeZone: "Asia/Kolkata",
                hour: "numeric",
                minute: "numeric",
                hour12: false
            }).formatToParts(dateObj);

            let hour = 0;
            let minute = 0;
            for (const part of timeParts) {
                if (part.type === "hour") hour = parseInt(part.value, 10);
                if (part.type === "minute") minute = parseInt(part.value, 10);
            }
            const totalMins = hour * 60 + minute;

            // Filter out post-market closing/settlement ticks (after 15:30 PM / 3:30 PM) for equity/index market
            if (totalMins > 930) {
                continue;
            }

            // India date
            const date = dateObj.toLocaleDateString("en-CA", {
                timeZone: "Asia/Kolkata"
            });

            // India time
            const time = dateObj.toLocaleTimeString("en-IN", {
                timeZone: "Asia/Kolkata"
            });

            candles.push({
                // Candle number
                index: candles.length + 1,

                // Main price & standard OHLC
                price: result.close[i],
                open: result.open[i],
                high: result.high[i],
                low: result.low[i],
                close: result.close[i],
                volume: result.volume ? result.volume[i] : 0,

                // Historical API does not provide these
                quantity: 0,

                // Candle date/time
                date,
                time,

                // Candle OHLC
                candleOpen: result.open[i],
                candleHigh: result.high[i],
                candleLow: result.low[i],
                candleClose: result.close[i],

                // Candle volume
                candleVolume: result.volume
                    ? result.volume[i]
                    : 0,

                // Historical API does not provide these
                averagePrice: 0,

                sellQuantity: 0,
                buyQuantity: 0,

                // Day OHLC is not available from this historical response
                dayOpen: 0,
                dayClose: 0,
                dayHigh: 0,
                dayLow: 0
            });
        }

        return candles;
    }
}

module.exports = {
    HistoricalData
};