const fs = require('fs');
const path = require('path');

const DEFAULT_CACHE_DIR = "C:\\candle data";

/**
 * Loads candles JSON file from C:\candle data or custom path
 * @param {string} symbol - e.g. "NIFTY_50" or "BANK_NIFTY"
 * @param {string} interval - e.g. "5"
 * @param {string} fromDate - YYYY-MM-DD
 * @param {string} toDate - YYYY-MM-DD
 * @param {string} customDir - optional directory override
 */
function loadCandleFile(symbol = "NIFTY_50", interval = "5", fromDate = null, toDate = null, customDir = DEFAULT_CACHE_DIR) {
    const targetDate = fromDate || new Date().toISOString().split('T')[0];
    const endDate = toDate || targetDate;
    const fileName = `${symbol}_${interval}_${targetDate}_${endDate}.json`;
    const filePath = path.join(customDir, fileName);

    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }
    return [];
}

/**
 * Loads all JSON candle files from a directory and merges/sorts them by timestamp
 * @param {string} dirPath 
 */
function loadAllCandlesFromDir(dirPath = DEFAULT_CACHE_DIR) {
    if (!fs.existsSync(dirPath)) return [];
    // Only load 5-minute interval files to avoid mixing 15-min or 1-min timeframe candles
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json') && !f.includes('_15_') && !f.includes('_1_'));
    let allCandles = [];

    for (const file of files) {
        try {
            const raw = fs.readFileSync(path.join(dirPath, file), 'utf-8');
            const candles = JSON.parse(raw);
            if (Array.isArray(candles)) {
                allCandles = allCandles.concat(candles);
            }
        } catch (e) {
            // skip corrupted file
        }
    }

    // Sort by timestamp
    allCandles.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Deduplicate by date + time
    const seen = new Set();
    const uniqueCandles = [];
    for (const c of allCandles) {
        if (!c.date || !c.time) continue;
        const key = `${c.date}_${c.time}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueCandles.push(c);
        }
    }

    return uniqueCandles;
}

module.exports = {
    loadCandleFile,
    loadAllCandlesFromDir
};
