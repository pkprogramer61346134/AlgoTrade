/**
 * Identifies if current date is Expiry Day for specific index
 * @param {string|Date} dateInput 
 * @param {string} symbol - "NIFTY" (Tuesday/Thursday), "BANKNIFTY" (Wednesday)
 */
function isExpiryDay(dateInput, symbol = "NIFTY") {
    const d = new Date(dateInput);
    const day = d.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri

    let isExpiry = false;
    if (symbol === "BANKNIFTY" && day === 3) isExpiry = true; // Wednesday
    if (symbol === "NIFTY" && day === 4) isExpiry = true;     // Thursday

    return { isExpiry, symbol, dayOfWeek: day };
}

module.exports = { isExpiryDay };
