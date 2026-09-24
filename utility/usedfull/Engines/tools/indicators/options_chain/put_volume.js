/**
 * Calculates total Put Volume across all strikes
 * @param {Object} optionChain - Dhan Option Chain Object
 */
function getTotalPutVolume(optionChain) {
    if (!optionChain || !optionChain.oc) return 0;
    let vol = 0;
    Object.values(optionChain.oc).forEach(s => {
        if (s.pe && s.pe.volume) vol += s.pe.volume;
    });
    return vol;
}

module.exports = { getTotalPutVolume };
