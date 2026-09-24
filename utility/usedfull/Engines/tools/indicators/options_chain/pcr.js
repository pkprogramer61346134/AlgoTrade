const { getTotalCallOI } = require('./call_oi');
const { getTotalPutOI } = require('./put_oi');
const { getTotalCallVolume } = require('./call_volume');
const { getTotalPutVolume } = require('./put_volume');

/**
 * Calculates Put-Call Ratio (PCR) for Open Interest and Volume
 * @param {Object} optionChain - Dhan Option Chain Object
 */
function calculatePCR(optionChain) {
    const totalCallOI = getTotalCallOI(optionChain);
    const totalPutOI = getTotalPutOI(optionChain);
    const totalCallVol = getTotalCallVolume(optionChain);
    const totalPutVol = getTotalPutVolume(optionChain);

    const pcrOI = totalCallOI > 0 ? Number((totalPutOI / totalCallOI).toFixed(2)) : 0;
    const pcrVolume = totalCallVol > 0 ? Number((totalPutVol / totalCallVol).toFixed(2)) : 0;

    let sentiment = "NEUTRAL";
    if (pcrOI > 1.2) sentiment = "BULLISH";
    else if (pcrOI < 0.7) sentiment = "BEARISH";

    return {
        pcrOI,
        pcrVolume,
        totalCallOI,
        totalPutOI,
        sentiment
    };
}

module.exports = { calculatePCR };
