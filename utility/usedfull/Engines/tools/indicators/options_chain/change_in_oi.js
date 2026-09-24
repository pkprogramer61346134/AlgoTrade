/**
 * Calculates total Intraday Change in Call OI and Put OI
 * @param {Object} optionChain - Dhan Option Chain Object
 */
function getChangeInOI(optionChain) {
    if (!optionChain || !optionChain.oc) return { callOIChange: 0, putOIChange: 0 };

    let callOIChange = 0;
    let putOIChange = 0;

    Object.values(optionChain.oc).forEach(strike => {
        if (strike.ce) {
            callOIChange += (strike.ce.oi || 0) - (strike.ce.previous_oi || 0);
        }
        if (strike.pe) {
            putOIChange += (strike.pe.oi || 0) - (strike.pe.previous_oi || 0);
        }
    });

    return { callOIChange, putOIChange };
}

module.exports = { getChangeInOI };
