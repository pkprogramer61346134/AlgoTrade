/**
 * Analyzes Foreign Institutional Investors (FII) Cash Segment Buy/Sell flow
 * @param {number} netBuySellCr - Net FII Cash Flow in ₹ Crores (e.g. +1250 or -850)
 */
function analyzeFIICashFlow(netBuySellCr) {
    if (netBuySellCr === undefined || netBuySellCr === null) return { sentiment: "NEUTRAL" };

    let sentiment = "NEUTRAL";
    if (netBuySellCr > 500) sentiment = "STRONG_INSTITUTIONAL_BUYING";
    else if (netBuySellCr < -500) sentiment = "STRONG_INSTITUTIONAL_SELLING";

    return { netBuySellCr, sentiment };
}

module.exports = { analyzeFIICashFlow };
