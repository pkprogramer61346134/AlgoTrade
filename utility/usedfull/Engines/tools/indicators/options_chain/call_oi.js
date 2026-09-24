/**
 * Calculates total Call Open Interest (Call OI) across strikes from Option Chain Matrix
 * @param {Object} optionChain - Dhan Option Chain Object { oc: { "strike": { ce, pe } } }
 */
function getTotalCallOI(optionChain) {
    if (!optionChain || !optionChain.oc) return 0;
    let totalCallOI = 0;
    Object.values(optionChain.oc).forEach(strike => {
        if (strike.ce && strike.ce.oi) {
            totalCallOI += strike.ce.oi;
        }
    });
    return totalCallOI;
}

module.exports = { getTotalCallOI };
