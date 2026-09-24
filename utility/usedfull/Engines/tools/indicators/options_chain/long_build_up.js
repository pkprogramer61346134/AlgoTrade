/**
 * Detects Long Buildup (Price Up ↑ & OI Up ↑) across strikes
 * @param {number} priceChange 
 * @param {number} oiChange 
 */
function isLongBuildup(priceChange, oiChange) {
    return priceChange > 0 && oiChange > 0;
}

module.exports = { isLongBuildup };
