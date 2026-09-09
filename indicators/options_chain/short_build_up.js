/**
 * Detects Short Buildup (Price Down ↓ & OI Up ↑) across strikes
 * @param {number} priceChange 
 * @param {number} oiChange 
 */
function isShortBuildup(priceChange, oiChange) {
    return priceChange < 0 && oiChange > 0;
}

module.exports = { isShortBuildup };
