const fs = require('fs');
const path = require('path');

function getCandleDataDir() {
    // 1. Explicit Environment Variable Override (for Google Cloud VM / Docker / Linux)
    if (process.env.CANDLE_DATA_DIR) {
        const envDir = path.resolve(process.env.CANDLE_DATA_DIR);
        if (!fs.existsSync(envDir)) {
            try { fs.mkdirSync(envDir, { recursive: true }); } catch (e) {}
        }
        return envDir;
    }

    // 2. Project Root Local Candle Data Directory (C:\AlgoTrade\candle_data)
    const localDir = path.resolve(__dirname, '../../../../../../candle_data');
    const fallbackRoot = path.resolve(process.cwd(), 'candle_data');

    const targetDir = fs.existsSync(localDir) ? localDir : fallbackRoot;

    if (!fs.existsSync(targetDir)) {
        try { fs.mkdirSync(targetDir, { recursive: true }); } catch (e) {}
    }
    return targetDir;
}

const DEFAULT_CACHE_DIR = getCandleDataDir();

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
    // Only load 5-minute interval files to avoid mixing 15-min or 1-min timeframe candles, and exclude synthetic auto files
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json') && !f.includes('_15_') && !f.includes('_1_') && !f.includes('auto'));
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
    getCandleDataDir,
    loadCandleFile,
    loadAllCandlesFromDir
};
