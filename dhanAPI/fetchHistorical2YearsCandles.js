const fs = require('fs');
const path = require('path');
const { DhanSDK } = require('./index');

const dhan = new DhanSDK();
const NIFTY_SECURITY_ID = "13";
const EXCHANGE_SEGMENT = "IDX_I";
const INSTRUMENT_TYPE = "INDEX";
const CACHE_DIR = "C:\\candle data";

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates monthly date chunks from startDate to endDate
 */
function generateMonthlyChunks(startDateStr, endDateStr) {
    const chunks = [];
    let start = new Date(startDateStr);
    const endLimit = new Date(endDateStr);

    while (start <= endLimit) {
        const year = start.getFullYear();
        const month = start.getMonth();

        // First day of month
        const chunkStart = new Date(Date.UTC(year, month, 1));
        // Last day of month
        const chunkEnd = new Date(Date.UTC(year, month + 1, 0));

        const actualStart = chunkStart < start ? start : chunkStart;
        const actualEnd = chunkEnd > endLimit ? endLimit : chunkEnd;

        const fromDateStr = actualStart.toISOString().split('T')[0];
        const toDateStr = actualEnd.toISOString().split('T')[0];

        chunks.push({ fromDate: fromDateStr, toDate: toDateStr });

        // Move to next month
        start = new Date(Date.UTC(year, month + 1, 1));
    }

    return chunks;
}

/**
 * Formats Dhan raw API candle arrays into standard candle JSON objects
 */
function formatDhanCandles(rawData) {
    const candlesByDate = {};

    if (!rawData || !rawData.timestamp || rawData.timestamp.length === 0) {
        return candlesByDate;
    }

    for (let i = 0; i < rawData.timestamp.length; i++) {
        const ts = rawData.timestamp[i];
        const dateObj = new Date(ts * 1000);

        // Standard Kolkata date and time formatting
        const dateStr = dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const timeStr = dateObj.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

        if (!candlesByDate[dateStr]) {
            candlesByDate[dateStr] = [];
        }

        candlesByDate[dateStr].push({
            index: candlesByDate[dateStr].length + 1,
            date: dateStr,
            time: timeStr,
            timestamp: ts,
            open: rawData.open[i],
            high: rawData.high[i],
            low: rawData.low[i],
            close: rawData.close[i],
            volume: rawData.volume ? rawData.volume[i] : 0
        });
    }

    return candlesByDate;
}

/**
 * Main function to fetch 1 to 2 years of 5-min Nifty candles using Dhan API
 */
async function fetchTwoYearsCandles(options = {}) {
    ensureCacheDir();

    // Default 2 years back from current date (2024-08-01 to 2026-08-29)
    const startDate = options.startDate || "2024-08-01";
    const endDate = options.endDate || new Date().toISOString().split('T')[0];
    const interval = options.interval || "5";

    console.log(`\n======================================================`);
    console.log(`🚀 Fetching ${startDate} to ${endDate} (${interval}-min) Nifty candles via Dhan API`);
    console.log(`📁 Saving to: ${CACHE_DIR}`);
    console.log(`======================================================\n`);

    const chunks = generateMonthlyChunks(startDate, endDate);
    console.log(`Generated ${chunks.length} monthly chunks for Dhan API fetching.\n`);

    let totalDaysSaved = 0;
    let totalDaysSkipped = 0;
    let totalCandlesSaved = 0;

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`[${i + 1}/${chunks.length}] Requesting Dhan API: ${chunk.fromDate} to ${chunk.toDate}...`);

        try {
            const response = await dhan.marketData.getIntradayData({
                securityId: NIFTY_SECURITY_ID,
                exchangeSegment: EXCHANGE_SEGMENT,
                instrument: INSTRUMENT_TYPE,
                interval: String(interval),
                fromDate: chunk.fromDate,
                toDate: chunk.toDate
            });

            if (response.status === 'success' && response.data) {
                const groupedCandles = formatDhanCandles(response.data);
                const dates = Object.keys(groupedCandles).sort();

                let chunkSavedCount = 0;
                let chunkSkippedCount = 0;

                dates.forEach(dateStr => {
                    const fileName = `NIFTY_50_${interval}_${dateStr}_${dateStr}.json`;
                    const filePath = path.join(CACHE_DIR, fileName);

                    // Skip if already cached
                    if (fs.existsSync(filePath)) {
                        chunkSkippedCount++;
                        totalDaysSkipped++;
                        return;
                    }

                    const dayCandles = groupedCandles[dateStr];
                    fs.writeFileSync(filePath, JSON.stringify(dayCandles, null, 2), 'utf-8');

                    chunkSavedCount++;
                    totalDaysSaved++;
                    totalCandlesSaved += dayCandles.length;
                });

                console.log(`   -> Received ${dates.length} trading days. Saved: ${chunkSavedCount} new date files, Skipped (already cached): ${chunkSkippedCount}`);
            } else {
                console.warn(`   ⚠️ Dhan API response warning for ${chunk.fromDate} to ${chunk.toDate}: ${response.message || 'No data'}`);
            }
        } catch (err) {
            console.error(`   ❌ Error fetching chunk ${chunk.fromDate}: ${err.message}`);
        }

        // Polite rate limit delay (300ms)
        await sleep(300);
    }

    console.log(`\n======================================================`);
    console.log(`✅ Completed 2-Year Candle Download!`);
    console.log(`📊 Summary:`);
    console.log(`   - New Trading Days Saved: ${totalDaysSaved}`);
    console.log(`   - Existing Trading Days Skipped: ${totalDaysSkipped}`);
    console.log(`   - Total Candles Saved: ${totalCandlesSaved}`);
    console.log(`   - Total Files in C:\\candle data: ${fs.readdirSync(CACHE_DIR).length}`);
    console.log(`======================================================\n`);
}

if (require.main === module) {
    fetchTwoYearsCandles();
}

module.exports = {
    fetchTwoYearsCandles
};
