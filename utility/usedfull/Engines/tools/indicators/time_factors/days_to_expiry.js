/**
 * Calculates Days To Expiry (DTE) between current date and target expiry date
 * @param {string|Date} currentDate 
 * @param {string|Date} expiryDate 
 */
function getDaysToExpiry(currentDate, expiryDate) {
    const curr = new Date(currentDate);
    const exp = new Date(expiryDate);

    const diffTime = exp.getTime() - curr.getTime();
    const dte = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return { dte: Math.max(0, dte), isExpired: dte <= 0 };
}

module.exports = { getDaysToExpiry };
