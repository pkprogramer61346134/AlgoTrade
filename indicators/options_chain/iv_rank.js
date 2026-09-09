/**
 * Calculates IV Rank (IVR) = (Current IV - 52W Min IV) / (52W Max IV - 52W Min IV) * 100
 * @param {number} currentIV 
 * @param {number} minIV52W 
 * @param {number} maxIV52W 
 */
function calculateIVRank(currentIV, minIV52W, maxIV52W) {
    if (maxIV52W === minIV52W || !currentIV) return 0;
    const ivr = ((currentIV - minIV52W) / (maxIV52W - minIV52W)) * 100;
    return Number(Math.max(0, Math.min(100, ivr)).toFixed(2));
}

module.exports = { calculateIVRank };
