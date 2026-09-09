/**
 * Analyzes Domestic Institutional Investors (DII) Cash Segment Buy/Sell flow
 * @param {number} netBuySellCr - Net DII Cash Flow in ₹ Crores
 */
function analyzeDIICashFlow(netBuySellCr) {
    if (netBuySellCr === undefined || netBuySellCr === null) return { sentiment: "NEUTRAL" };

    let sentiment = "NEUTRAL";
    if (netBuySellCr > 500) sentiment = "DOMESTIC_BUYING_SUPPORT";
    else if (netBuySellCr < -500) sentiment = "DOMESTIC_SELLING_PRESSURE";

    return { netBuySellCr, sentiment };
}

module.exports = { analyzeDIICashFlow };
