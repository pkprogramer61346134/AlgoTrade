const fs = require('fs');
const path = require('path');
const { getCandleDataDir, loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const { DhanSDK } = require('../dhanAPI');
const { systemLogger } = require('./systemLogger');

/**
 * CENTRAL CANDLE DATA HUB
 * 
 * Central Gateway for Strategies & Indicators to request historical candle data.
 * 
 * Smart 2-Tier Architecture:
 * 1. Checks local persistent cache folder (C:\candle data).
 * 2. If requested dates exist locally -> Returns immediately (Lightning Fast).
 * 3. If requested dates are missing -> Hits Dhan Historical API, downloads candles to C:\candle data, and returns merged dataset.
 */
class CentralCandleDataHub {
    constructor(dhanInstance = null) {
        this.dhan = dhanInstance || new DhanSDK();
    }

    get cacheDir() {
        return getCandleDataDir();
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

module.exports = {
    CentralCandleDataHub,
    candleDataHub
};
