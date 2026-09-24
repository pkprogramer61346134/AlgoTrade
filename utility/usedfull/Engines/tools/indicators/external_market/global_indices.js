/**
 * Summarizes Global Market Sentiment (US Markets: S&P 500, Nasdaq, Dow Jones)
 * @param {Object} indicesData - { sp500: changePct, nasdaq: changePct, dow: changePct }
 */
function analyzeGlobalSentiment(indicesData = {}) {
    const sp500 = indicesData.sp500 || 0;
    const nasdaq = indicesData.nasdaq || 0;
    const dow = indicesData.dow || 0;

    const avgChange = (sp500 + nasdaq + dow) / 3;
    let globalBias = "NEUTRAL";

    if (avgChange > 0.5) globalBias = "STRONG_BULLISH";
    else if (avgChange > 0.1) globalBias = "MILD_BULLISH";
    else if (avgChange < -0.5) globalBias = "STRONG_BEARISH";
    else if (avgChange < -0.1) globalBias = "MILD_BEARISH";

    return {
        avgChange: Number(avgChange.toFixed(2)),
        globalBias
    };
}

module.exports = { analyzeGlobalSentiment };
