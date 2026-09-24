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
    async fetchSingleDateRange(securityId, exchangeSegment, instrument, interval, fromDate, toDate, forceRefresh) {
        const fileName = this.getCacheFileName(securityId, exchangeSegment, interval, fromDate, toDate);
        const filePath = path.join(this.cacheDir, fileName);

        // 1. Check if cached file exists on disk with valid candles
        if (!forceRefresh && fs.existsSync(filePath)) {
            try {
                const rawContent = fs.readFileSync(filePath, "utf-8");
                const cachedCandles = JSON.parse(rawContent);
                if (Array.isArray(cachedCandles) && cachedCandles.length > 0) {
                    console.log(`💾 [DISK CACHE HIT] Loaded ${cachedCandles.length} candles from: ${fileName}`);
                    return { source: "DISK_CACHE", fileName, filePath, candles: cachedCandles };
                } else {
                    // Remove 0-candle empty cache file so future calls re-attempt API
                    try { fs.unlinkSync(filePath); } catch (e) {}
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
            console.warn(`⚠️ [API FETCH NOTICE] Market closed / No data on ${fromDate}: ${apiErr.message}`);
            candles = [];
        }

        // 3. Save / Download to local disk cache folder (including empty arrays for market holidays)
        try {
            fs.writeFileSync(filePath, JSON.stringify(candles || [], null, 2), "utf-8");
        } catch (writeErr) {
            console.error(`❌ [CACHE SAVE ERROR] Failed to save file to disk: ${writeErr.message}`);
        }

        return { source: "DHAN_API", fileName, filePath, candles: candles || [] };
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
        const securityId = String(params.securityId || "13");
        const exchangeSegment = params.exchangeSegment || "IDX_I";
        const instrument = params.instrument || "INDEX";
        const interval = String(params.interval || "5");
        const requestedCount = Number(params.count || params.candleCount || 0);
        const forceRefresh = Boolean(params.forceRefresh || false);

        // =========================================================
        // MODE 1: CANDLE COUNT MODE (e.g. count: 200 or 400 candles)
        // =========================================================
        if (requestedCount > 0) {
            // Support reference target date (toDate / date) and target time (toTime / time)
            const anchorDateStr = params.toDate || params.date || params.untilDate || null;
            const targetTimeStr = params.toTime || params.time || params.untilTime || null;
            const targetTimeSeconds = targetTimeStr ? this.parseTimeToSeconds(targetTimeStr) : null;

            let startFromDateObj;
            if (anchorDateStr) {
                startFromDateObj = new Date(anchorDateStr + "T00:00:00");
                if (isNaN(startFromDateObj.getTime())) {
                    startFromDateObj = new Date();
                }
            } else {
                startFromDateObj = new Date();
            }

            const effectiveAnchorDateStr = this.formatDateStr(startFromDateObj);
            const timeLabel = targetTimeStr ? ` up to ${effectiveAnchorDateStr} ${targetTimeStr}` : ` up to ${effectiveAnchorDateStr}`;
            console.log(`🔍 [CANDLE COUNT MODE] Requested latest ${requestedCount} candles (${interval}m interval) for ${securityId}${timeLabel}...`);

            // Estimate candles per day (75 for 5m, 25 for 15m, 375 for 1m)
            const intervalMins = Number(interval) || 5;
            const candlesPerDay = Math.floor(375 / intervalMins) || 75;
            const daysNeeded = Math.ceil(requestedCount / candlesPerDay) + 5; // Add extra buffer for weekends/holidays

            let accumulatedCandles = [];
            let lastSource = "DISK_CACHE";

            // Loop backwards day by day from startFromDateObj to collect candles
            for (let i = 0; i < daysNeeded; i++) {
                const targetDateObj = new Date(startFromDateObj);
                targetDateObj.setDate(startFromDateObj.getDate() - i);
                const dateStr = this.formatDateStr(targetDateObj);

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
                    // If target date matches effectiveAnchorDateStr and a cutoff time is provided, filter candles up to target time
                    if (dateStr === effectiveAnchorDateStr && targetTimeSeconds !== null) {
                        filteredDayCandles = dayRes.candles.filter(c => {
                            const candleSecs = this.parseTimeToSeconds(c.time);
                            return candleSecs <= targetTimeSeconds;
                        });
                    }

                    accumulatedCandles = filteredDayCandles.concat(accumulatedCandles);
                }

                // Stop loop early if we have collected enough candles
                if (accumulatedCandles.length >= requestedCount + 50) {
                    break;
                }
            }

            // Re-index candles sequentially (1 to N)
            const slicedCandles = accumulatedCandles.slice(-requestedCount).map((c, index) => ({
                ...c,
                index: index + 1
            }));

            console.log(`✅ [CANDLE COUNT COMPLETE] Returning exact ${slicedCandles.length} latest candles.`);

            return {
                status: "success",
                mode: "CANDLE_COUNT",
                requestedCount,
                untilDate: effectiveAnchorDateStr,
                untilTime: targetTimeStr || "EOD",
                totalCandles: slicedCandles.length,
                source: lastSource,
                data: slicedCandles
            };
        }

        // =========================================================
        // MODE 2: DATE RANGE MODE (fromDate & toDate)
        // =========================================================
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

// Global helper function for quick one-line calling
async function getCachedCandles(params) {
    const manager = new CachedHistoricalData();
    return await manager.getCandleData(params);
}

module.exports = {
    CachedHistoricalData,
    getCachedCandles
};
