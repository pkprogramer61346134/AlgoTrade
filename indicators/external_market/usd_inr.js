/**
 * Evaluates USD/INR Currency rate movement impact on Indian Equity Market
 * @param {number} usdInrRate - Current USD/INR rate (e.g. 83.5)
 * @param {number} prevRate - Previous USD/INR rate
 */
function analyzeUsdInrImpact(usdInrRate, prevRate) {
    if (!usdInrRate || !prevRate) return { impact: "NEUTRAL" };

    const changePct = ((usdInrRate - prevRate) / prevRate) * 100;
    let impact = "NEUTRAL";

    // Rupee weakening (USD/INR rising) is usually negative for Indian equities (FII outflow risk)
    if (changePct > 0.3) impact = "NEGATIVE_EQUITY_IMPACT";
    // Rupee strengthening (USD/INR falling) is positive
    else if (changePct < -0.3) impact = "POSITIVE_EQUITY_IMPACT";

    return { usdInrRate, changePct: Number(changePct.toFixed(2)), impact };
}

module.exports = { analyzeUsdInrImpact };
