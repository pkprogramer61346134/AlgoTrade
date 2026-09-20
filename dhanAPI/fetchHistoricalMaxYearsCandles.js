const fs = require('fs');
const path = require('path');
const { DhanSDK } = require('./index');

const dhan = new DhanSDK();
const NIFTY_SECURITY_ID = "13";
const EXCHANGE_SEGMENT = "IDX_I";
const { getCandleDataDir } = require('../indicators/utils/dataLoader');
const CACHE_DIR = getCandleDataDir();

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

        const chunkStart = new Date(Date.UTC(year, month, 1));
        const chunkEnd = new Date(Date.UTC(year, month + 1, 0));

        const actualStart = chunkStart < start ? start : chunkStart;
        const actualEnd = chunkEnd > endLimit ? endLimit : chunkEnd;

        const fromDateStr = actualStart.toISOString().split('T')[0];
        const toDateStr = actualEnd.toISOString().split('T')[0];

        chunks.push({ fromDate: fromDateStr, toDate: toDateStr });

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
 * Main function to fetch MAXIMUM (8+ Years: 2018 to 2026) 5-min Nifty candles via Dhan API
 */
async function fetchMaxHistoricalCandles(options = {}) {
    ensureCacheDir();

    // Max available range from Dhan API: 2018-01-01 to Current Date (2026-08-29) -> Full 8+ Years!
    const startDate = options.startDate || "2018-01-01";
    const endDate = options.endDate || new Date().toISOString().split('T')[0];
    const interval = options.interval || "5";

    console.log(`\n======================================================`);
    console.log(`🚀 Fetching MAX AVAILABLE HISTORICAL DATA (${startDate} to ${endDate})`);
    console.log(`📊 Asset: Nifty 50 (${interval}-min candles) | Dhan API`);
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

                console.log(`   -> Received ${dates.length} trading days. Saved: ${chunkSavedCount} new date files, Skipped (cached): ${chunkSkippedCount}`);
            } else {
                console.warn(`   ⚠️ Dhan API warning for ${chunk.fromDate} to ${chunk.toDate}: ${response.message || 'No data'}`);
            }
        } catch (err) {
            console.error(`   ❌ Error fetching chunk ${chunk.fromDate}: ${err.message}`);
        }

        // Polite rate-limit delay
        await sleep(350);
    }

    console.log(`\n======================================================`);
    console.log(`✅ Completed Full 8+ Year Historical Download!`);
    console.log(`📊 Summary:`);
    console.log(`   - New Trading Days Saved: ${totalDaysSaved}`);
    console.log(`   - Existing Trading Days Skipped: ${totalDaysSkipped}`);
    console.log(`   - Total Candles Saved in Run: ${totalCandlesSaved}`);
    console.log(`   - Total Files in C:\\candle data: ${fs.readdirSync(CACHE_DIR).length}`);
    console.log(`======================================================\n`);
}

if (require.main === module) {
    fetchMaxHistoricalCandles();
}

module.exports = {
    fetchMaxHistoricalCandles
};
