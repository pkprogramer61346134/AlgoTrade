/**
 * Evaluates Crude Oil price trend impact on Indian Equity Market
 * @param {number} crudeOilPrice - Brent/WTI Crude Oil price (e.g. 75.0)
 * @param {number} prevPrice 
 */
function analyzeCrudeOilImpact(crudeOilPrice, prevPrice) {
    if (!crudeOilPrice || !prevPrice) return { impact: "NEUTRAL" };

    const changePct = ((crudeOilPrice - prevPrice) / prevPrice) * 100;
    let impact = "NEUTRAL";

    // High Crude oil prices increase India's import bill & inflation -> negative for market
    if (changePct > 2.0) impact = "BEARISH_CRUDE_SURGE";
    else if (changePct < -2.0) impact = "BULLISH_CRUDE_DROP";

    return { crudeOilPrice, changePct: Number(changePct.toFixed(2)), impact };
}

module.exports = { analyzeCrudeOilImpact };
