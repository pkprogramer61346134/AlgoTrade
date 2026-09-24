/**
 * Detects Long Unwinding (Price Down ↓ & OI Down ↓) across strikes
 * @param {number} priceChange 
 * @param {number} oiChange 
 */
function isLongUnwinding(priceChange, oiChange) {
    return priceChange < 0 && oiChange < 0;
}

module.exports = { isLongUnwinding };
