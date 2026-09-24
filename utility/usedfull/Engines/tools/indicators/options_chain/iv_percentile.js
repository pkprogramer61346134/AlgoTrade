/**
 * Calculates IV Percentile (IVP) = % of days in the past 1 year where IV was lower than current IV
 * @param {number} currentIV 
 * @param {Array} historicalIVs - Array of daily IV values over past year
 */
function calculateIVPercentile(currentIV, historicalIVs = []) {
    if (!historicalIVs || historicalIVs.length === 0 || !currentIV) return 0;
    const lowerDays = historicalIVs.filter(iv => iv < currentIV).length;
    const ivp = (lowerDays / historicalIVs.length) * 100;
    return Number(ivp.toFixed(2));
}

module.exports = { calculateIVPercentile };
