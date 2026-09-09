/**
 * Extracts average Implied Volatility (IV) for ATM strikes
 * @param {Object} optionChain - Dhan Option Chain Object
 */
function getATMImpliedVolatility(optionChain) {
    if (!optionChain || !optionChain.oc) return { atmIV: 0 };

    const spotPrice = optionChain.last_price || 0;
    const strikes = Object.keys(optionChain.oc).map(Number).sort((a, b) => a - b);

    if (strikes.length === 0) return { atmIV: 0 };

    // Find closest ATM strike
    const atmStrike = strikes.reduce((prev, curr) => Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev);
    const strikeData = optionChain.oc[atmStrike.toFixed(6)] || optionChain.oc[atmStrike];

    const ceIV = strikeData?.ce?.implied_volatility || 0;
    const peIV = strikeData?.pe?.implied_volatility || 0;
    const avgIV = (ceIV + peIV) / 2;

    return {
        atmStrike,
        ceIV: Number(ceIV.toFixed(2)),
        peIV: Number(peIV.toFixed(2)),
        atmIV: Number(avgIV.toFixed(2))
    };
}

module.exports = { getATMImpliedVolatility };
