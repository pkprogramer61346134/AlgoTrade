const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const { getCandleDataDir, loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { DhanSDK } = require('../dhanAPI');
let systemLogger;
try {
    systemLogger = require('../src/systemLogger').systemLogger;
} catch (e) {
    systemLogger = { logError: console.error };
}

/**
 * CENTRAL CANDLE DATA HUB
 * 
 * Central Gateway for Strategies & Indicators to request historical candle data
 * AND connect to the WebSocket Messaging Server for real-time live data streaming.
 * 
 * Smart 2-Tier Architecture:
 * 1. Checks local persistent cache folder (C:\candle data).
 * 2. If requested dates exist locally -> Returns immediately (Lightning Fast).
 * 3. If requested dates are missing -> Hits Dhan Historical API, downloads candles to C:\candle data, and returns merged dataset.
 * 4. WebSocket Client -> Connects to server (e.g. ws://localhost:8080) for live streaming & messaging between components.
 */
class CentralCandleDataHub {
    constructor(dhanInstance = null) {
        this.dhan = dhanInstance || new DhanSDK();
        this.ws = null;
        this.wsConnected = false;
        this.clientId = 'candleDataHub';
        this.wsUrl = 'ws://localhost:8080';
        this.messageCallbacks = [];
        this.autoReconnect = true;
        this.reconnectTimer = null;
    }

    get cacheDir() {
        return getCandleDataDir();
    }

    /**
     * Connect to the central WebSocket Messaging Server (e.g., ws://localhost:8080)
     * @param {string} serverUrl - e.g. "ws://localhost:8080"
     * @param {string} clientId - unique client identifier
     */
    connectWebSocket(serverUrl = 'ws://localhost:8080', clientId = 'candleDataHub') {
        this.wsUrl = serverUrl;
        this.clientId = clientId;
        this.autoReconnect = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        try {
            console.log(`📡 [DATA HUB WS] Connecting to WebSocket Server at ${this.wsUrl} as "${this.clientId}"...`);
            this.ws = new WebSocket(this.wsUrl);

            this.ws.on('open', () => {
                this.wsConnected = true;
                console.log(`✅ [DATA HUB WS] Connected to WebSocket Server.`);
                // Register with server
                this.sendRaw({ type: 'REGISTER', clientId: this.clientId });
            });

            this.ws.on('message', (rawData) => {
                try {
                    const message = JSON.parse(rawData.toString());
                    this.handleWsMessage(message);
                } catch (e) {
                    console.error('[DATA HUB WS] Failed to parse message:', e.message);
                }
            });

            this.ws.on('close', () => {
                this.wsConnected = false;
                console.warn(`⚠️ [DATA HUB WS] Connection closed.`);
                if (this.autoReconnect) {
                    console.log(`🔄 [DATA HUB WS] Reconnecting in 3 seconds...`);
                    this.reconnectTimer = setTimeout(() => this.connectWebSocket(this.wsUrl, this.clientId), 3000);
                }
            });

            this.ws.on('error', (err) => {
                console.error(`❌ [DATA HUB WS] Error: ${err.message}`);
            });
        } catch (err) {
            console.error(`❌ [DATA HUB WS] Failed to initiate connection: ${err.message}`);
        }
    }

    /**
     * Handle incoming WebSocket messages & notify registered component callbacks
     */
    handleWsMessage(message) {
        // Auto-ack delivery when a message is forwarded to this component
        if (message.type === 'FORWARD_MESSAGE') {
            this.sendRaw({
                type: 'CLIENT_DELIVERED_ACK',
                messageId: message.messageId,
                originalSenderId: message.senderId
            });

            // Check if client is requesting candles by date/interval
            const payload = message.payload;
            if (payload && (payload.action === 'GET_CANDLES' || payload.action === 'GET_HISTORICAL_CANDLES')) {
                this.handleCandleDataRequest(message.senderId, payload);
            }
        }

        // Trigger external callbacks for any component listening to candleDataHub
        for (const cb of this.messageCallbacks) {
            try {
                cb(message);
            } catch (err) {
                console.error('[DATA HUB WS] Callback execution error:', err.message);
            }
        }
    }

    /**
     * Handles incoming GET_CANDLES requests from any client over WebSocket
     */
    async handleCandleDataRequest(senderId, payload) {
        const { startDate, endDate, symbol = "NIFTY_50", interval = "5" } = payload;
        console.log(`📊 [DATA HUB WS] Processing GET_CANDLES request from "${senderId}" (${startDate} to ${endDate}, Symbol: ${symbol}, Interval: ${interval}m)...`);

        try {
            const candles = await this.getCandles(startDate, endDate, symbol, String(interval));
            this.sendWsMessage({
                status: 'SUCCESS',
                action: 'CANDLE_DATA_RESPONSE',
                symbol,
                interval,
                startDate,
                endDate,
                count: candles.length,
                candles
            }, senderId);
        } catch (err) {
            console.error(`❌ [DATA HUB WS] Error fetching candles for "${senderId}":`, err.message);
            this.sendWsMessage({
                status: 'ERROR',
                action: 'CANDLE_DATA_RESPONSE',
                error: err.message
            }, senderId);
        }
    }

    /**
     * Register a callback function to listen for messages arriving via WebSocket
     * @param {Function} callback - (message) => { ... }
     */
    onWsMessage(callback) {
        if (typeof callback === 'function') {
            this.messageCallbacks.push(callback);
        }
    }

    /**
     * Send a custom payload over WebSocket to another client or broadcast
     * @param {object} payload - data payload
     * @param {string|null} recipientId - target client ID (or null to let server auto-reply/broadcast)
     */
    sendWsMessage(payload, recipientId = null) {
        if (!this.wsConnected || !this.ws) {
            console.warn('⚠️ [DATA HUB WS] Cannot send message - WebSocket is not connected.');
            return false;
        }

        const msgPacket = {
            type: 'SEND_MESSAGE',
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            payload
        };

        if (recipientId) {
            msgPacket.recipientId = recipientId;
        }

        this.sendRaw(msgPacket);
        return true;
    }

    /**
     * Broadcast live candle update to all components listening on WebSocket
     * @param {object} candleData - candle object { date, time, open, high, low, close, volume }
     * @param {string|null} recipientId - optional target client
     */
    broadcastCandle(candleData, recipientId = null) {
        return this.sendWsMessage({
            event: 'LIVE_CANDLE_UPDATE',
            symbol: candleData.symbol || 'NIFTY_50',
            candle: candleData,
            timestamp: Date.now()
        }, recipientId);
    }

    sendRaw(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    /**
     * Close WebSocket connection gracefully
     */
    disconnectWebSocket() {
        this.autoReconnect = false;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.wsConnected = false;
        }
    }

    /**
     * Set/update Dhan SDK instance for API fallback fetching
     */
    setDhanInstance(dhanSdk) {
        if (dhanSdk) {
            this.dhan = dhanSdk;
        }
    }

    /**
     * Main Data Retrieval Function for Strategies & Indicators
     * @param {string} startDate - YYYY-MM-DD
     * @param {string} endDate - YYYY-MM-DD
     * @param {string} symbol - e.g. "NIFTY_50"
     * @param {string} interval - e.g. "5"
     */
    async getCandles(startDate = null, endDate = null, symbol = "NIFTY_50", interval = "5") {
        let allCandles = loadAllCandlesFromDir(this.cacheDir);

        if (!startDate && !endDate) {
            return allCandles;
        }

        const start = startDate || endDate;
        const end = endDate || startDate;

        // Check if local candles cover requested dates
        const existingDates = new Set(allCandles.map(c => c.date));
        const missingDates = [];

        let cur = new Date(start);
        const stop = new Date(end);
        while (cur <= stop) {
            const dayOfWeek = cur.getUTCDay();
            const dateStr = cur.toISOString().split('T')[0];
            // Skip weekends (Saturday = 6, Sunday = 0)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                if (!existingDates.has(dateStr)) {
                    missingDates.push(dateStr);
                }
            }
            cur.setDate(cur.getDate() + 1);
        }

        const todayKolkata = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const isTodayRequested = (start === todayKolkata || end === todayKolkata || (start <= todayKolkata && end >= todayKolkata));

        // If any date is missing from local disk (or today's live data is requested), hit Dhan API
        if (missingDates.length > 0 || isTodayRequested) {
            console.log(`🌐 [DATA HUB] Missing/Live candle data requested for ${start} to ${end}. Hitting Dhan API...`);
            await this.downloadAndCacheFromDhan(start, end, symbol, interval);
            allCandles = loadAllCandlesFromDir(this.cacheDir);
        }

        // Return candles filtered by requested date range
        if (start && end) {
            return allCandles.filter(c => c.date >= start && c.date <= end);
        }
        return allCandles;
    }

    /**
     * Get candles with N prior warmup candles for optimal indicator calculation (EMA 50, ATR, RSI, etc.)
     */
    async getCandlesWithWarmup(startDate, endDate, warmupCount = 300, symbol = "NIFTY_50", interval = "5") {
        let allCandles = loadAllCandlesFromDir(this.cacheDir);
        
        // Ensure requested dates are cached locally first
        await this.getCandles(startDate, endDate, symbol, interval);

        let updatedAll = loadAllCandlesFromDir(this.cacheDir);
        if (!startDate) return updatedAll;

        let startIndex = updatedAll.findIndex(c => c.date >= startDate);

        // If available warmup candles before startDate are less than warmupCount (e.g. < 300), auto-fetch prior 15 calendar days from Dhan API
        if ((startIndex < 0 || startIndex < warmupCount) && startDate) {
            try {
                const sDateObj = new Date(startDate);
                const priorDateObj = new Date(sDateObj.getTime() - 15 * 24 * 60 * 60 * 1000);
                const priorStartStr = priorDateObj.toISOString().split('T')[0];
                const dayBeforeStartObj = new Date(sDateObj.getTime() - 1 * 24 * 60 * 60 * 1000);
                const dayBeforeStartStr = dayBeforeStartObj.toISOString().split('T')[0];

                console.log(`🌐 [DATA HUB WARMUP] Sourced ${warmupCount} prior historical warmup candles (${priorStartStr} to ${dayBeforeStartStr}) from Dhan API...`);
                await this.downloadAndCacheFromDhan(priorStartStr, dayBeforeStartStr, symbol, interval);
                updatedAll = loadAllCandlesFromDir(this.cacheDir);
                startIndex = updatedAll.findIndex(c => c.date >= startDate);
            } catch (e) {
                console.warn(`⚠️ [DATA HUB WARMUP] Sourcing warning: ${e.message}`);
            }
        }

        if (startIndex < 0) return updatedAll;

        const warmupStart = Math.max(0, startIndex - warmupCount);
        const endIndex = endDate ? updatedAll.findLastIndex(c => c.date <= endDate) : updatedAll.length - 1;

        return updatedAll.slice(warmupStart, endIndex >= 0 ? endIndex + 1 : updatedAll.length);
    }

    /**
     * Synchronously returns cached prior warmup candles from local disk
     */
    getWarmupSync(startDate, warmupCount = 300) {
        const allCandles = loadAllCandlesFromDir(this.cacheDir);
        if (!startDate || allCandles.length === 0) return allCandles.slice(-warmupCount);

        const targetIndex = allCandles.findIndex(c => c.date >= startDate);
        if (targetIndex < 0) return allCandles.slice(-warmupCount);

        const startPos = Math.max(0, targetIndex - warmupCount);
        return allCandles.slice(startPos, targetIndex);
    }

    /**
     * Hits Dhan API, fetches 5-min candles, formats, and saves to C:\candle data
     */
    async downloadAndCacheFromDhan(fromDate, toDate, symbol = "NIFTY_50", interval = "5") {
        try {
            const securityId = "13"; // NIFTY 50 Index Security ID on Dhan
            const exchangeSegment = "IDX_I";
            const instrument = "INDEX";

            let rawData = null;
            if (this.dhan && this.dhan.marketData && typeof this.dhan.marketData.getIntradayData === 'function') {
                rawData = await this.dhan.marketData.getIntradayData({
                    securityId,
                    exchangeSegment,
                    instrument,
                    fromDate,
                    toDate,
                    interval: Number(interval) || 5
                });
            } else if (this.dhan && typeof this.dhan.getIntradayData === 'function') {
                rawData = await this.dhan.getIntradayData({ securityId, exchangeSegment, instrument, fromDate, toDate, interval: Number(interval) || 5 });
            }

            const timestamps = rawData?.data?.start_Time || rawData?.data?.timestamp || rawData?.data?.start_time;
            if (rawData && rawData.data && Array.isArray(timestamps)) {
                const len = timestamps.length;
                const candles = [];

                for (let i = 0; i < len; i++) {
                    const epochSec = timestamps[i];
                    const d = new Date(epochSec * 1000);
                    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                    const timeStr = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }).substring(0, 5);

                    candles.push({
                        date: dateStr,
                        time: timeStr,
                        timestamp: epochSec,
                        open: Number(rawData.data.open[i]),
                        high: Number(rawData.data.high[i]),
                        low: Number(rawData.data.low[i]),
                        close: Number(rawData.data.close[i]),
                        volume: Number(rawData.data.volume ? rawData.data.volume[i] : 0)
                    });
                }

                if (candles.length > 0) {
                    const fileName = `${symbol}_${interval}_${fromDate}_${toDate}.json`;
                    const filePath = path.join(this.cacheDir, fileName);
                    fs.writeFileSync(filePath, JSON.stringify(candles, null, 2), 'utf8');
                    console.log(`✅ [DATA HUB] Successfully downloaded & cached ${candles.length} candles to ${filePath}`);
                    return candles;
                }
            }
        } catch (e) {
            systemLogger.logError("CANDLE_DATA_HUB", `Failed to fetch candles from Dhan API for date ${fromDate} to ${toDate}: ${e.message}`, { fromDate, toDate, symbol, stack: e.stack });
            console.warn(`⚠️ [DATA HUB] Failed to fetch from Dhan API: ${e.message}`);
        }
        return [];
    }
}

// Export singleton instance as well as class definition
const candleDataHub = new CentralCandleDataHub();

// Allow direct execution via command line (node Candlehub/candleDataHub.js)
if (require.main === module) {
    console.log('===========================================================');
    console.log('🕯️ Central Candle Data Hub Service Starting...');
    console.log('===========================================================');
    
    candleDataHub.onWsMessage((msg) => {
        if (msg.type === 'FORWARD_MESSAGE') {
            console.log(`📥 [DataHub Received] From: "${msg.senderId}" | Payload:`, msg.payload);
        }
    });

    candleDataHub.connectWebSocket('ws://localhost:8080', 'candleDataHub');
    console.log('📡 CandleDataHub is listening for WebSocket connections...');
}

module.exports = {
    CentralCandleDataHub,
    candleDataHub
};

