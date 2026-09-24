/**
 * Calculates total Call Volume across all strikes
 * @param {Object} optionChain - Dhan Option Chain Object
 */
function getTotalCallVolume(optionChain) {
    if (!optionChain || !optionChain.oc) return 0;
    let vol = 0;
    Object.values(optionChain.oc).forEach(s => {
        if (s.ce && s.ce.volume) vol += s.ce.volume;
    });
    return vol;
}

module.exports = { getTotalCallVolume };
