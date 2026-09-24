/**
 * Evaluates India VIX level and returns volatility regime sentiment
 * @param {number} vixValue - Current India VIX value (e.g. 13.5)
 */
function analyzeIndiaVix(vixValue) {
    if (vixValue === undefined || vixValue === null || isNaN(vixValue)) {
        return { regime: "UNKNOWN", riskLevel: "MODERATE", vix: null };
    }

    let regime = "NORMAL";
    let riskLevel = "MODERATE";

    if (vixValue < 12) {
        regime = "LOW_VOLATILITY";
        riskLevel = "LOW";
    } else if (vixValue >= 12 && vixValue <= 17) {
        regime = "NORMAL_VOLATILITY";
        riskLevel = "MODERATE";
    } else if (vixValue > 17 && vixValue <= 23) {
        regime = "HIGH_VOLATILITY";
        riskLevel = "HIGH";
    } else {
        regime = "EXTREME_VOLATILITY";
        riskLevel = "EXTREME";
    }

    return { vix: vixValue, regime, riskLevel };
}

module.exports = { analyzeIndiaVix };
