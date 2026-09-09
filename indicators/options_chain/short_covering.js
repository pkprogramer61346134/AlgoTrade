/**
 * Detects Short Covering (Price Up ↑ & OI Down ↓) across strikes
 * @param {number} priceChange 
 * @param {number} oiChange 
 */
function isShortCovering(priceChange, oiChange) {
    return priceChange > 0 && oiChange < 0;
}

module.exports = { isShortCovering };
