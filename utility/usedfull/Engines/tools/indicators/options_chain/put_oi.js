/**
 * Calculates total Put Open Interest (Put OI) across strikes from Option Chain Matrix
 * @param {Object} optionChain - Dhan Option Chain Object
 */
function getTotalPutOI(optionChain) {
    if (!optionChain || !optionChain.oc) return 0;
    let totalPutOI = 0;
    Object.values(optionChain.oc).forEach(strike => {
        if (strike.pe && strike.pe.oi) {
            totalPutOI += strike.pe.oi;
        }
    });
    return totalPutOI;
}

module.exports = { getTotalPutOI };
