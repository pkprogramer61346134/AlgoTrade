/**
 * Calculates Distance of Spot Price from closest ATM Strike and Strike Gap
 * @param {number} spotPrice 
 * @param {number} strikeGap - Step size (e.g. 50 for Nifty, 100 for BankNifty)
 */
function calculateDistanceFromATM(spotPrice, strikeGap = 50) {
    if (!spotPrice) return { atmStrike: 0, distancePoints: 0 };

    const atmStrike = Math.round(spotPrice / strikeGap) * strikeGap;
    const distancePoints = spotPrice - atmStrike;

    return {
        spotPrice,
        atmStrike,
        distancePoints: Number(distancePoints.toFixed(2)),
        isITM: distancePoints > 0
    };
}

module.exports = { calculateDistanceFromATM };
