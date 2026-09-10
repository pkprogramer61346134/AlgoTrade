const { loadAllCandlesFromDir } = require('../indicators/utils/dataLoader');
const DATA_DIR = "C:\\candle data";
const allCandles = loadAllCandlesFromDir(DATA_DIR);

const mayCount = allCandles.filter(c => c.date && c.date.startsWith("2026-05")).length;
const juneCount = allCandles.filter(c => c.date && c.date.startsWith("2026-06")).length;

console.log("May 2026 candle count:", mayCount);
console.log("June 2026 candle count:", juneCount);
