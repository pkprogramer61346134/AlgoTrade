const path = require('path');
const fs = require('fs');

const { loadAllCandlesFromDir, getCandleDataDir } = require('../indicators/utils/dataLoader');
const { loadAllStrategiesFromJSON } = require('../src/strategyLoader');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../src/dynamicStrategyEngine');

function parseTimeToMins(tStr) {
    if (!tStr) return 0;
    // Format: "9:15:00 am" or "14:30:00" or "09:15:00"
    let clean = tStr.toLowerCase().trim();
    let isPM = clean.includes('pm');
    let isAM = clean.includes('am');
    clean = clean.replace('am', '').replace('pm', '').trim();
    const parts = clean.split(':').map(Number);
    let hrs = parts[0] || 0;
    let mins = parts[1] || 0;
    if (isPM && hrs < 12) hrs += 12;
    if (isAM && hrs === 12) hrs = 0;
    return hrs * 60 + mins;
}

console.log("Testing 9:15 AM Mins:", parseTimeToMins("9:15:00 am"));
console.log("Testing 9:30 AM Mins:", parseTimeToMins("9:30:00 am"));
console.log("Testing 12:08 PM Mins:", parseTimeToMins("12:08:00 pm"));
