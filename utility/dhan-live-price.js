const config = require("./token/config");
const WebSocket = require("ws");

class DhanLivePrice {
    constructor(options = {}) {
        this.clientId = options.clientId || config.CLIENT_ID;
        this.accessToken = options.accessToken || config.ACCESS_TOKEN;
        this.baseUrl = options.baseUrl || config.BASE_URL;

        this.ws = null;
        this.candleData = null;
        this.lastCandleTimestamp = null;
    }

    async getLatestCandle(
        securityId,
        exchangeSegment,
        instrument,
        interval
    ) {
        try {
            const today = new Date().toLocaleDateString("en-CA", {
                timeZone: "Asia/Kolkata"
            });

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
                        fromDate: today,
                        toDate: today
                    })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                console.error(
                    "Dhan Candle API Error:",
                    result?.remarks?.error_message ||
                    result?.message ||
                    "Intraday API failed"
                );
                return;
            }

            if (
                !result?.timestamp ||
                !Array.isArray(result.timestamp) ||
                result.timestamp.length === 0
            ) {
                return;
            }

            const lastIndex = result.timestamp.length - 1;
            const timestamp = result.timestamp[lastIndex];

            /*
             * Same timestamp conversion as
             * your historical candle code.
             */
            const dateObj = new Date(timestamp * 1000);

            const date = dateObj.toLocaleDateString("en-CA", {
                timeZone: "Asia/Kolkata"
            });

            const time = dateObj.toLocaleTimeString("en-IN", {
                timeZone: "Asia/Kolkata"
            });

            this.candleData = {
                date,
                time,
                timestamp,

                candleOpen:
                    result.open?.[lastIndex] ?? 0,

                candleHigh:
                    result.high?.[lastIndex] ?? 0,

                candleLow:
                    result.low?.[lastIndex] ?? 0,

                candleClose:
                    result.close?.[lastIndex] ?? 0,

                candleVolume:
                    result.volume?.[lastIndex] ?? 0
            };

            this.lastCandleTimestamp = timestamp;

        } catch (error) {
            console.error(
                "Candle API Error:",
                error.message
            );
        }
    }

    getLivePrice(
        securityId,
        exchangeSegment,
        interval = 5,
        onData,
        instrument = "INDEX"
    ) {
        if (typeof onData !== "function") {
            throw new Error("onData callback required");
        }

        const minutes = Number(interval);

        if (!Number.isFinite(minutes) || minutes <= 0) {
            throw new Error("Invalid interval");
        }

        /*
         * Get latest candle initially.
         */
        this.getLatestCandle(
            securityId,
            exchangeSegment,
            instrument,
            minutes
        );

        const wsUrl =
            `wss://api-feed.dhan.co?version=2` +
            `&token=${this.accessToken}` +
            `&clientId=${this.clientId}` +
            `&authType=2`;

        this.ws = new WebSocket(wsUrl);

        this.ws.on("open", () => {
            console.log("Dhan Live Feed Connected");

            this.ws.send(
                JSON.stringify({
                    RequestCode: 17,
                    InstrumentCount: 1,
                    InstrumentList: [
                        {
                            ExchangeSegment: exchangeSegment,
                            SecurityId: String(securityId)
                        }
                    ]
                })
            );

            console.log(
                `Subscribed: ${exchangeSegment} ${securityId} | ${minutes}m`
            );
        });

        this.ws.on("message", async (data) => {
            if (!Buffer.isBuffer(data)) {
                return;
            }

            // Dhan Quote Packet = 50 bytes
            if (data.length < 50) {
                return;
            }

            const responseCode = data.readUInt8(0);

            // Quote Packet
            if (responseCode !== 4) {
                return;
            }

            try {
                /*
                 * =========================
                 * LIVE QUOTE FIELDS
                 * =========================
                 */

                const price = data.readFloatLE(8);
                const quantity = data.readInt16LE(12);

                const averagePrice = data.readFloatLE(18);
                const volume = data.readInt32LE(22);
                const sellQuantity = data.readInt32LE(26);
                const buyQuantity = data.readInt32LE(30);

                const dayOpen = data.readFloatLE(34);
                const dayClose = data.readFloatLE(38);
                const dayHigh = data.readFloatLE(42);
                const dayLow = data.readFloatLE(46);

                /*
                 * =========================
                 * FINAL DATA
                 * =========================
                 */

                const now = new Date();
                const dateStr = this.candleData?.date || now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
                const timeStr = this.candleData?.time || now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

                onData({
                    price,
                    quantity,

                    date: dateStr,
                    time: timeStr,

                    open: this.candleData?.candleOpen || price,
                    high: this.candleData?.candleHigh ? Math.max(this.candleData.candleHigh, price) : price,
                    low: this.candleData?.candleLow ? Math.min(this.candleData.candleLow, price) : price,
                    close: price,
                    volume: this.candleData?.candleVolume || volume || 100,

                    candleOpen:
                        this.candleData?.candleOpen ?? 0,

                    candleHigh:
                        this.candleData?.candleHigh ?? 0,

                    candleLow:
                        this.candleData?.candleLow ?? 0,

                    candleClose:
                        this.candleData?.candleClose ?? 0,

                    candleVolume:
                        this.candleData?.candleVolume ?? 0,

                    averagePrice,
                    volume,
                    sellQuantity,
                    buyQuantity,

                    dayOpen,
                    dayClose,
                    dayHigh,
                    dayLow
                });

            } catch (error) {
                console.error(
                    "Dhan Live Packet Error:",
                    error.message
                );
            }
        });

        this.ws.on("error", (error) => {
            console.error(
                "Dhan Live Feed Error:",
                error.message
            );
        });

        this.ws.on("close", () => {
            console.log("Dhan Live Feed Closed");
        });
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

module.exports = { DhanLivePrice };