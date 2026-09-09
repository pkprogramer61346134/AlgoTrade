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
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
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
    return allCandles;
}

module.exports = {
    loadCandleFile,
    loadAllCandlesFromDir
};
