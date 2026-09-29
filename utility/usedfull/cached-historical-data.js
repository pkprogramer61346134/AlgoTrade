/**
 * Cached Historical & Intraday Candle Manager Utility
 * Location: C:\AlgoTrade\utility\usedfull\cached-historical-data.js
 * 
 * Features Supported:
 * 1. Date Range Mode (fromDate & toDate):
 *    - Checks if JSON file exists in local disk cache (C:\AlgoTrade\candle_data\).
 *    - If MISSING: Hits Dhan API via HistoricalData utility, downloads JSON file to disk, and returns candles.
 *    - If EXISTS: Loads directly from local disk cache with ZERO Dhan API hits!
 * 
 * 2. Candle Count Mode (e.g. count: 200 or 400):
 *    - Automatically calculates past dates from current time going backwards.
 *    - Loads/fetches candles across past days from disk cache or API.
 *    - Returns exact requested N candles (e.g. latest 200 or 400 candles).
 */

const fs = require("fs");
const path = require("path");
const { HistoricalData } = require("../historicaldata");

class CachedHistoricalData {
    constructor(options = {}) {
        this.historical = new HistoricalData(options);
        // Base cache directory at C:\AlgoTrade\candle_data
        this.cacheDir = options.cacheDir || path.join(__dirname, "../../candle_data");

        // Ensure cache directory exists
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Generate unique filename for caching single day candle data
     */
    getCacheFileName(securityId, exchangeSegment, interval, fromDate, toDate) {
        const cleanSecId = String(securityId).replace(/[^a-zA-Z0-9]/g, "_");
        const cleanSeg = String(exchangeSegment).replace(/[^a-zA-Z0-9]/g, "_");
        const cleanFrom = String(fromDate).replace(/[^a-zA-Z0-9]/g, "-");
        const cleanTo = String(toDate).replace(/[^a-zA-Z0-9]/g, "-");
        return `candles_${cleanSecId}_${cleanSeg}_${interval}m_${cleanFrom}_to_${cleanTo}.json`;
    }

    /**
     * Helper to format Date object to "YYYY-MM-DD" in Asia/Kolkata timezone
     */
    formatDateStr(dateObj) {
        return dateObj.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    }

    /**
     * Helper to parse time string (e.g. "9:15:00 am", "14:30:00", "02:30 pm") into seconds since midnight
     */
    parseTimeToSeconds(timeStr) {
        if (!timeStr || typeof timeStr !== "string") return 24 * 3600;

        const cleanStr = timeStr.trim().toLowerCase();
        const isPM = cleanStr.includes("pm");
        const isAM = cleanStr.includes("am");

        const timeOnly = cleanStr.replace(/(am|pm)/gi, "").trim();
        const parts = timeOnly.split(":");

        let hours = parseInt(parts[0] || "0", 10);
        let minutes = parseInt(parts[1] || "0", 10);
        let seconds = parseInt(parts[2] || "0", 10);

        if (isPM && hours < 12) {
            hours += 12;
        } else if (isAM && hours === 12) {
            hours = 0;
        }

        return hours * 3600 + minutes * 60 + seconds;
    }

    /**
     * Helper to generate array of date strings ("YYYY-MM-DD") between start and end date (inclusive)
     */
    getDatesInRange(startDateStr, endDateStr) {
        const dates = [];
        try {
            let curr = new Date(startDateStr + "T00:00:00");
            const end = new Date(endDateStr + "T00:00:00");

            if (isNaN(curr.getTime()) || isNaN(end.getTime())) {
                return [startDateStr];
            }

            while (curr <= end) {
                const year = curr.getFullYear();
                const month = String(curr.getMonth() + 1).padStart(2, "0");
                const day = String(curr.getDate()).padStart(2, "0");
                dates.push(`${year}-${month}-${day}`);
                curr.setDate(curr.getDate() + 1);
            }
        } catch (err) {
            dates.push(startDateStr);
        }
        return dates.length > 0 ? dates : [startDateStr];
    }

    /**
     * Fetch or load candle data for a single date range
     */
    async fetchSingleDateRange(securityId, exchangeSegment, instrument, interval, fromDate, toDate, forceRefresh, targetTimeSeconds = null) {
        const fileName = this.getCacheFileName(securityId, exchangeSegment, interval, fromDate, toDate);
        const filePath = path.join(this.cacheDir, fileName);

        // Helper to normalize candle OHLC & volume fields
        const normalizeCandles = (arr) => {
            if (!Array.isArray(arr)) return [];
            return arr.map(c => ({
                ...c,
                open: Number(c.open ?? c.candleOpen ?? c.price ?? 0),
                high: Number(c.high ?? c.candleHigh ?? c.price ?? 0),
                low: Number(c.low ?? c.candleLow ?? c.price ?? 0),
                close: Number(c.close ?? c.candleClose ?? c.price ?? 0),
                volume: Number(c.volume ?? c.candleVolume ?? 0)
            }));
        };

        const todayStr = this.formatDateStr(new Date());

        // 1. Check Disk Cache
        if (!forceRefresh && fs.existsSync(filePath)) {
            try {
                const rawContent = fs.readFileSync(filePath, "utf-8");
                const cachedCandles = JSON.parse(rawContent);

                if (Array.isArray(cachedCandles) && cachedCandles.length > 0) {
                    let isStaleTodayFile = false;

                    // If cache file is for TODAY's date, check if last candle is older than current target time or current market time
                    if (fromDate === todayStr && toDate === todayStr) {
                        const lastCandleInFile = cachedCandles[cachedCandles.length - 1];
                        if (lastCandleInFile && lastCandleInFile.time) {
                            const lastCandleSecs = this.parseTimeToSeconds(lastCandleInFile.time);
                            const nowSecs = this.parseTimeToSeconds(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }));
                            const stepSecs = (Number(interval) || 5) * 60;

                            // Re-fetch if target time is newer than cached last candle, or if current time is past last candle by >= stepSecs
                            if ((targetTimeSeconds !== null && targetTimeSeconds > lastCandleSecs) ||
                                (nowSecs >= 33300 && nowSecs <= 55800 && (nowSecs - lastCandleSecs >= stepSecs))) {
                                isStaleTodayFile = true;
                            }
                        }
                    }

                    if (!isStaleTodayFile) {
                        const normalized = normalizeCandles(cachedCandles);
                        console.log(`💾 [DISK CACHE HIT] Loaded ${normalized.length} candles from: ${fileName}`);
                        return { source: "DISK_CACHE", fileName, filePath, candles: normalized };
                    } else {
                        console.log(`🔄 [TODAY CACHE REFRESH] Today's cache (${fileName}) is outdated. Re-fetching latest candles from Dhan API...`);
                    }
                } else {
                    // Only remove empty cache file if it is for TODAY (market might open later), keep past holiday empty files intact
                    if (fromDate === todayStr) {
                        try { fs.unlinkSync(filePath); } catch (e) {}
                    }
                }
            } catch (err) {
                console.warn(`⚠️ [CACHE READ WARNING] Failed to parse ${fileName}: ${err.message}. Re-fetching...`);
                try { fs.unlinkSync(filePath); } catch (e) {}
            }
        }

        // Skip weekend days (Saturday=6, Sunday=0) for single date requests
        if (fromDate === toDate) {
            const dateObj = new Date(fromDate + "T00:00:00");
            const dayOfWeek = dateObj.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                return { source: "WEEKEND_SKIP", fileName, filePath, candles: [] };
            }
        }

        // 2. Fetch from Dhan API if missing from disk cache or forced refresh
        console.log(`🌐 [API FETCH] Requesting candle data from Dhan API for ${securityId} [${fromDate} to ${toDate}]...`);
        let candles = [];
        try {
            candles = await this.historical.getHistoricalData({
                securityId,
                exchangeSegment,
                instrument,
                interval,
                fromDate,
                toDate
            });
        } catch (apiErr) {
            const errStr = String(apiErr.message || "").toLowerCase();
            if (errStr.includes("token") || errStr.includes("invalid") || errStr.includes("expired") || errStr.includes("401") || errStr.includes("failed")) {
                console.warn(`🔄 [DHAN TOKEN REFRESH] Access Token missing/expired. Attempting automatic TOTP refresh...`);
                try {
                    const { autoRefreshDhanToken } = require("../token/autoTokenRefresh");
                    const refRes = await autoRefreshDhanToken();
                    if (refRes && refRes.status === "success") {
                        candles = await this.historical.getHistoricalData({
                            securityId,
                            exchangeSegment,
                            instrument,
                            interval,
                            fromDate,
                            toDate
                        });
                    }
                } catch (tokErr) {
                    console.warn(`⚠️ [TOKEN REFRESH NOTICE] ${tokErr.message}`);
                }
            } else {
                console.warn(`⚠️ [API FETCH NOTICE] Market closed / No data on ${fromDate}: ${apiErr.message}`);
            }
        }

        const normalized = normalizeCandles(candles);

        // 3. Save / Download to local disk cache folder (including empty arrays for market holidays)
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(normalized || [], null, 2), "utf-8");
        } catch (writeErr) {
            console.error(`❌ [CACHE SAVE ERROR] Failed to save file to disk: ${writeErr.message}`);
        }

        return { source: "DHAN_API", fileName, filePath, candles: normalized };
    }

    /**
     * Get exact N historical candles prior to (and including) a target date and time.
     * 
     * @param {Object|string} dateOrParams - Target date string ("YYYY-MM-DD") OR params object
     * @param {string|number} [timeStr] - Target time cutoff ("HH:MM:SS" or "01:30:00 pm") OR count if positional
     * @param {number} [count] - Number of candles requested (e.g. 200, 300)
     * @param {Object} [options={}] - Options (securityId, exchangeSegment, instrument, interval, forceRefresh, inclusive)
     * @returns {Promise<Object>} Candle Result object { status, mode, requestedCount, targetDate, targetTime, totalCandles, source, data }
     */
    async getCandlesBeforeDateTime(dateOrParams, timeStr, count, options = {}) {
        let dateVal;
        let timeVal;
        let countVal;
        let opts = {};

        if (typeof dateOrParams === "object" && dateOrParams !== null && !(dateOrParams instanceof Date)) {
            opts = { ...dateOrParams };
            dateVal = opts.date || opts.toDate || opts.untilDate || opts.fromDate;
            timeVal = opts.time || opts.toTime || opts.untilTime;
            countVal = opts.count || opts.candleCount || opts.limit;
        } else {
            dateVal = dateOrParams;
            if (typeof timeStr === "number" && (count === undefined || count === null)) {
                countVal = timeStr;
                timeVal = null;
            } else {
                timeVal = timeStr;
                countVal = count;
            }
            opts = { ...options };
        }

        const targetCount = Number(countVal || opts.count || opts.candleCount || opts.limit || 200);
        const inclusive = opts.inclusive !== false; // Default true (includes candle matching target time)

        // Format target date string ("YYYY-MM-DD")
        let targetDateStr;
        if (dateVal instanceof Date) {
            targetDateStr = this.formatDateStr(dateVal);
        } else if (typeof dateVal === "string" && dateVal.trim() !== "") {
            targetDateStr = dateVal.trim();
        } else {
            targetDateStr = this.formatDateStr(new Date());
        }

        const securityId = String(opts.securityId || "13");
        const exchangeSegment = opts.exchangeSegment || "IDX_I";
        const instrument = opts.instrument || "INDEX";
        const interval = String(opts.interval || "5");
        const forceRefresh = Boolean(opts.forceRefresh || false);

        const targetTimeSeconds = timeVal ? this.parseTimeToSeconds(String(timeVal)) : null;
        const timeLabel = timeVal ? ` up to ${targetDateStr} ${timeVal}` : ` up to ${targetDateStr} EOD`;

        console.log(`🔍 [GET CANDLES BEFORE] Fetching ${targetCount} candles (${interval}m interval) for scrip ${securityId}${timeLabel}...`);

        // Estimate candles per day based on market hours (375 mins / interval)
        const intervalMins = Number(interval) || 5;
        const candlesPerDay = Math.floor(375 / intervalMins) || 75;
        // Buffer days for weekends, market holidays, partial days
        const daysNeeded = Math.ceil(targetCount / candlesPerDay) + 7;

        let startFromDateObj = new Date(targetDateStr + "T00:00:00");
        if (isNaN(startFromDateObj.getTime())) {
            startFromDateObj = new Date();
        }

        let accumulatedCandles = [];
        let lastSource = "DISK_CACHE";

        // Fetch backwards day by day from startFromDateObj
        for (let i = 0; i < daysNeeded; i++) {
            const currentDateObj = new Date(startFromDateObj);
            currentDateObj.setDate(startFromDateObj.getDate() - i);
            const dateStr = this.formatDateStr(currentDateObj);

            const dayRes = await this.fetchSingleDateRange(
                securityId,
                exchangeSegment,
                instrument,
                interval,
                dateStr,
                dateStr,
                forceRefresh
            );

            if (dayRes.source === "DHAN_API") {
                lastSource = "DHAN_API";
            }

            if (Array.isArray(dayRes.candles) && dayRes.candles.length > 0) {
                let filteredDayCandles = dayRes.candles;
                const todayStr = this.formatDateStr(new Date());

                // If filtering today's date, filter out incomplete/unclosed candles
                if (dateStr === todayStr) {
                    const nowSecs = this.parseTimeToSeconds(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }));
                    const stepSecs = (Number(interval) || 5) * 60;

                    filteredDayCandles = filteredDayCandles.filter(c => {
                        const candleSecs = this.parseTimeToSeconds(c.time);
                        // A candle starting at candleSecs is only closed if nowSecs >= candleSecs + stepSecs
                        const isClosed = nowSecs >= (candleSecs + stepSecs);
                        const matchesTargetTime = targetTimeSeconds === null || (inclusive ? candleSecs <= targetTimeSeconds : candleSecs < targetTimeSeconds);
                        return isClosed && matchesTargetTime;
                    });
                } else if (dateStr === targetDateStr && targetTimeSeconds !== null) {
                    // On historical target date, filter by targetTime cutoff
                    filteredDayCandles = filteredDayCandles.filter(c => {
                        const candleSecs = this.parseTimeToSeconds(c.time);
                        return inclusive ? (candleSecs <= targetTimeSeconds) : (candleSecs < targetTimeSeconds);
                    });
                }

                accumulatedCandles = filteredDayCandles.concat(accumulatedCandles);
            }

            // Stop loop early if we have collected enough candles
            if (accumulatedCandles.length >= targetCount + 50) {
                break;
            }
        }

        // Return exact requested N candles (or all collected if total < targetCount)
        const slicedCandles = accumulatedCandles.slice(-targetCount).map((c, idx) => ({
            ...c,
            index: idx + 1
        }));

        console.log(`✅ [GET CANDLES BEFORE COMPLETE] Loaded ${slicedCandles.length} candles ending at ${targetDateStr} ${timeVal || "EOD"}.`);

        return {
            status: "success",
            mode: "CANDLES_BEFORE_DATETIME",
            requestedCount: targetCount,
            targetDate: targetDateStr,
            targetTime: timeVal || "EOD",
            totalCandles: slicedCandles.length,
            source: lastSource,
            data: slicedCandles
        };
    }

    /**
     * Alias for getCandlesBeforeDateTime
     */
    async getCandlesBefore(dateOrParams, timeStr, count, options) {
        return await this.getCandlesBeforeDateTime(dateOrParams, timeStr, count, options);
    }

    /**
     * Main Function: Get Candle Data (Supports Date Range OR Exact Candle Count e.g. 200, 400 candles)
     * 
     * @param {Object} params
     * @param {string|number} [params.securityId="13"] - Dhan Scrip ID (e.g. "13" for Nifty)
     * @param {string} [params.exchangeSegment="IDX_I"] - Segment
     * @param {string} [params.instrument="INDEX"] - Instrument type
     * @param {string|number} [params.interval="5"] - Candle interval in minutes ("1", "5", "15")
     * @param {string} [params.fromDate] - From Date ("YYYY-MM-DD")
     * @param {string} [params.toDate] - To Date ("YYYY-MM-DD")
     * @param {string} [params.date] - Date for candle count cutoff ("YYYY-MM-DD")
     * @param {string} [params.time] - Time cutoff ("HH:MM:SS" or "01:30:00 pm")
     * @param {string} [params.toTime] - Alias for time cutoff
     * @param {number} [params.count] - Exact number of past candles to return (e.g. 200, 400)
     * @param {number} [params.candleCount] - Alias for count
     * @param {boolean} [params.forceRefresh=false] - If true, re-fetches from Dhan API
     * @returns {Promise<Object>} Candle Result object { status, source, totalCandles, data }
     */
    async getCandleData(params = {}) {
        const requestedCount = Number(params.count || params.candleCount || params.limit || 0);

        // =========================================================
        // MODE 1: CANDLE COUNT MODE (e.g. count: 200 or 400 candles)
        // =========================================================
        if (requestedCount > 0) {
            const res = await this.getCandlesBeforeDateTime(params);
            return {
                status: res.status,
                mode: "CANDLE_COUNT",
                requestedCount: res.requestedCount,
                untilDate: res.targetDate,
                untilTime: res.targetTime,
                totalCandles: res.totalCandles,
                source: res.source,
                data: res.data
            };
        }

        // =========================================================
        // MODE 2: DATE RANGE MODE (fromDate & toDate)
        // =========================================================
        const securityId = String(params.securityId || "13");
        const exchangeSegment = params.exchangeSegment || "IDX_I";
        const instrument = params.instrument || "INDEX";
        const interval = String(params.interval || "5");
        const forceRefresh = Boolean(params.forceRefresh || false);

        const todayStr = this.formatDateStr(new Date());
        const fromDate = params.fromDate || todayStr;
        const toDate = params.toDate || fromDate;

        const dateList = this.getDatesInRange(fromDate, toDate);
        console.log(`📅 [DATE RANGE MODE] Fetching candles from ${fromDate} to ${toDate} (${dateList.length} day(s))...`);

        let accumulatedCandles = [];
        let primarySource = "DISK_CACHE";
        let lastFileName = "";
        let lastFilePath = "";

        for (const dateStr of dateList) {
            const dayRes = await this.fetchSingleDateRange(
                securityId,
                exchangeSegment,
                instrument,
                interval,
                dateStr,
                dateStr,
                forceRefresh
            );

            if (dayRes.source === "DHAN_API") {
                primarySource = "DHAN_API";
            }
            lastFileName = dayRes.fileName;
            lastFilePath = dayRes.filePath;

            if (Array.isArray(dayRes.candles) && dayRes.candles.length > 0) {
                accumulatedCandles = accumulatedCandles.concat(dayRes.candles);
            }
        }

        // Re-index candles sequentially (1 to N)
        const reindexedCandles = accumulatedCandles.map((c, index) => ({
            ...c,
            index: index + 1
        }));

        console.log(`✅ [DATE RANGE COMPLETE] Loaded ${reindexedCandles.length} candles across ${dateList.length} day(s).`);

        return {
            status: "success",
            mode: "DATE_RANGE",
            fromDate,
            toDate,
            source: primarySource,
            fileName: lastFileName,
            filePath: lastFilePath,
            totalCandles: reindexedCandles.length,
            data: reindexedCandles
        };
    }
}

// Global helper functions for quick one-line calling
async function getCachedCandles(params) {
    const manager = new CachedHistoricalData();
    return await manager.getCandleData(params);
}

async function getCandlesBeforeDateTime(dateOrParams, timeStr, count, options) {
    const manager = new CachedHistoricalData();
    return await manager.getCandlesBeforeDateTime(dateOrParams, timeStr, count, options);
}

async function getCandlesBefore(dateOrParams, timeStr, count, options) {
    const manager = new CachedHistoricalData();
    return await manager.getCandlesBefore(dateOrParams, timeStr, count, options);
}

module.exports = {
    CachedHistoricalData,
    getCachedCandles,
    getCandlesBeforeDateTime,
    getCandlesBefore
};
