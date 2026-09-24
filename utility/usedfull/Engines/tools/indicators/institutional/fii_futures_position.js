/**
 * Evaluates FII Index Futures Long vs Short contracts ratio
 * @param {number} longContracts 
 * @param {number} shortContracts 
 */
function analyzeFIIFuturesPositions(longContracts = 0, shortContracts = 0) {
    const total = longContracts + shortContracts;
    if (total === 0) return { longRatio: 0, bias: "NEUTRAL" };

    const longRatio = (longContracts / total) * 100;
    let bias = "NEUTRAL";

    if (longRatio >= 65) bias = "BULLISH_HEAVY";
    else if (longRatio <= 35) bias = "BEARISH_HEAVY";

    return {
        longContracts,
        shortContracts,
        longRatio: Number(longRatio.toFixed(2)),
        bias
    };
}

module.exports = { analyzeFIIFuturesPositions };
