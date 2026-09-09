/**
 * Identifies the Strike Price with the Highest Call Open Interest (Key OI Resistance)
 * @param {Object} optionChain - Dhan Option Chain Object
 */
function getOIResistance(optionChain) {
    if (!optionChain || !optionChain.oc) return { resistanceStrike: null, maxCallOI: 0 };

    let maxCallOI = -1;
    let resistanceStrike = null;

    Object.entries(optionChain.oc).forEach(([strike, data]) => {
        const callOI = data?.ce?.oi || 0;
        if (callOI > maxCallOI) {
            maxCallOI = callOI;
            resistanceStrike = Number(strike);
        }
    });

    return { resistanceStrike, maxCallOI };
}

module.exports = { getOIResistance };
