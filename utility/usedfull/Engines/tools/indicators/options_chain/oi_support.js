/**
 * Identifies the Strike Price with the Highest Put Open Interest (Key OI Support)
 * @param {Object} optionChain - Dhan Option Chain Object
 */
function getOISupport(optionChain) {
    if (!optionChain || !optionChain.oc) return { supportStrike: null, maxPutOI: 0 };

    let maxPutOI = -1;
    let supportStrike = null;

    Object.entries(optionChain.oc).forEach(([strike, data]) => {
        const putOI = data?.pe?.oi || 0;
        if (putOI > maxPutOI) {
            maxPutOI = putOI;
            supportStrike = Number(strike);
        }
    });

    return { supportStrike, maxPutOI };
}

module.exports = { getOISupport };
