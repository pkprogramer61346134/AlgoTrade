/**
 * Dhan Option Strike Live Price & PnL WebSocket Tracker
 * Location: C:\AlgoTrade\utility\dhan-option-live-price.js
 * 
 * Purpose:
 * Connects to Dhan Live WebSocket (wss://api-feed.dhan.co) and streams
 * tick-by-tick real-time Option LTP, Volume, Day High/Low, and live PnL.
 */

const config = require("./token/config");
const WebSocket = require("ws");
const { DhanMarketData } = require("./dhan-market-data");

class DhanOptionLivePrice {
    constructor(options = {}) {
        this.clientId = options.clientId || config.CLIENT_ID;
        this.accessToken = options.accessToken || config.ACCESS_TOKEN;
        this.baseUrl = options.baseUrl || config.BASE_URL;

        this.ws = null;
        this.isConnected = false;
        this.subscribedSecurityId = null;
        this.pollTimer = null;
    }

    /**
     * Start live WebSocket streaming for an Option Contract
     * 
     * @param {Object} params
     * @param {string|number} params.securityId - Dhan Option Contract Security ID (e.g. "74003")
     * @param {string} [params.exchangeSegment="NSE_FNO"] - Exchange Segment (Default: "NSE_FNO")
     * @param {number} [params.buyPrice=0] - Option Buy Entry Price (Optional for live PnL)
     * @param {number} [params.qty=0] - Position Quantity (Optional for live PnL)
     * @param {Function} onTick - Callback triggered on every tick
     */
    streamOptionLtp(params = {}, onTick) {
        if (typeof onTick !== "function") {
            throw new Error("[DHAN OPTION LIVE] onTick callback is required");
        }

        const securityId = String(params.securityId);
        const exchangeSegment = params.exchangeSegment || "NSE_FNO";
        const buyPrice = Number(params.buyPrice || 0);
        const qty = Number(params.qty || 0);

        if (!securityId) {
            throw new Error("[DHAN OPTION LIVE] Option securityId is required");
        }

        this.subscribedSecurityId = securityId;

        // Dynamically load freshest token config
        try {
            delete require.cache[require.resolve("./token/config")];
            const freshConfig = require("./token/config");
            this.clientId = freshConfig.CLIENT_ID || this.clientId;
            this.accessToken = freshConfig.ACCESS_TOKEN || this.accessToken;
            this.baseUrl = freshConfig.BASE_URL || this.baseUrl;
        } catch (e) {}

        const marketData = new DhanMarketData();
        const fetchRestQuote = async () => {
            try {
                const res = await marketData.getMarketQuote({ [exchangeSegment]: [Number(securityId)] });
                const quoteObj = res?.data?.data?.[exchangeSegment]?.[String(securityId)];
                if (quoteObj && quoteObj.last_price > 0) {
                    const price = Number(quoteObj.last_price.toFixed(2));
                    const diff = buyPrice > 0 ? (price - buyPrice) : 0;
                    const livePnl = Number((diff * qty).toFixed(2));
                    const pnlPctVal = buyPrice > 0 ? ((diff / buyPrice) * 100) : 0;
                    const pnlPercent = `${pnlPctVal >= 0 ? '+' : ''}${pnlPctVal.toFixed(2)}%`;

                    onTick({
                        status: "live",
                        securityId,
                        exchangeSegment,
                        price: price,
                        ltp: price,
                        liveLtp: price,
                        close: price,
                        high: price,
                        low: price,
                        candleClose: price,
                        candleHigh: price,
                        candleLow: price,
                        buyPrice,
                        qty,
                        livePnl,
                        pnlPercent,
                        volume: quoteObj.volume || 0,
                        buyQuantity: quoteObj.buy_quantity || 0,
                        sellQuantity: quoteObj.sell_quantity || 0,
                        dayOpen: quoteObj.ohlc?.open || price,
                        dayClose: quoteObj.ohlc?.close || price,
                        dayHigh: quoteObj.ohlc?.high || price,
                        dayLow: quoteObj.ohlc?.low || price,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {}
        };

        // Immediately fetch REST quote for option
        fetchRestQuote();

        // 2.5s fallback polling loop
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(fetchRestQuote, 2500);

        const wsUrl = `wss://api-feed.dhan.co?version=2&token=${this.accessToken}&clientId=${this.clientId}&authType=2`;
        this.ws = new WebSocket(wsUrl);

        this.ws.on("open", () => {
            this.isConnected = true;
            console.log(`📡 [DHAN OPTION LIVE] Connected! Subscribing to Option Contract: ${securityId} (${exchangeSegment})...`);

            // Subscribe via RequestCode 17 (Quote Packet Mode)
            this.ws.send(JSON.stringify({
                RequestCode: 17,
                InstrumentCount: 1,
                InstrumentList: [
                    {
                        ExchangeSegment: exchangeSegment,
                        SecurityId: securityId
                    }
                ]
            }));
        });

        this.ws.on("message", (data) => {
            if (!Buffer.isBuffer(data) || data.length < 16) {
                return;
            }

            const responseCode = data.readUInt8(0);

            try {
                let price = 0;
                let volume = 0;
                let buyQuantity = 0;
                let sellQuantity = 0;
                let dayOpen = 0;
                let dayClose = 0;
                let dayHigh = 0;
                let dayLow = 0;

                // Response Code 4: Quote Packet (50 bytes)
                if (responseCode === 4 && data.length >= 50) {
                    price = Number(data.readFloatLE(8).toFixed(2));
                    volume = data.readInt32LE(22);
                    sellQuantity = data.readInt32LE(26);
                    buyQuantity = data.readInt32LE(30);
                    dayOpen = Number(data.readFloatLE(34).toFixed(2));
                    dayClose = Number(data.readFloatLE(38).toFixed(2));
                    dayHigh = Number(data.readFloatLE(42).toFixed(2));
                    dayLow = Number(data.readFloatLE(46).toFixed(2));
                } 
                // Response Code 2: Ticker Packet (16 bytes)
                else if (responseCode === 2 && data.length >= 16) {
                    price = Number(data.readFloatLE(8).toFixed(2));
                } else {
                    return;
                }

                if (price <= 0) return;

                // Calculate Live PnL if buyPrice and qty are provided
                let livePnl = 0;
                let pnlPercent = 0;
                if (buyPrice > 0 && qty > 0) {
                    livePnl = Number(((price - buyPrice) * qty).toFixed(2));
                    pnlPercent = Number((((price - buyPrice) / buyPrice) * 100).toFixed(2));
                }

                onTick({
                    status: "live",
                    securityId,
                    exchangeSegment,
                    price: price,
                    ltp: price,
                    liveLtp: price,
                    close: price,
                    high: price,
                    low: price,
                    candleClose: price,
                    candleHigh: price,
                    candleLow: price,
                    buyPrice,
                    qty,
                    livePnl,
                    pnlPercent,
                    volume,
                    buyQuantity,
                    sellQuantity,
                    dayOpen,
                    dayClose,
                    dayHigh,
                    dayLow,
                    timestamp: Date.now()
                });

            } catch (err) {
                console.error(`⚠️ [DHAN OPTION LIVE] Packet Parsing Warning: ${err.message}`);
            }
        });

        this.ws.on("error", (error) => {
            console.error(`❌ [DHAN OPTION LIVE] WebSocket Error: ${error.message}`);
        });

        this.ws.on("close", () => {
            this.isConnected = false;
            console.log(`🔌 [DHAN OPTION LIVE] WebSocket Feed Closed for ${securityId}`);
        });
    }

    /**
     * Disconnect WebSocket stream
     */
    close() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }
    }
}

module.exports = {
    DhanOptionLivePrice
};
