/**
 * Calculates Max Pain Strike Price (where option writers incur minimum total payout loss)
 * @param {Object} optionChain - Dhan Option Chain Object
 */
function calculateMaxPain(optionChain) {
    if (!optionChain || !optionChain.oc) return { maxPainStrike: null };

    const strikes = Object.keys(optionChain.oc).map(Number).sort((a, b) => a - b);
    let minTotalPain = Infinity;
    let maxPainStrike = null;

    strikes.forEach(testStrike => {
        let totalPain = 0;

        strikes.forEach(s => {
            const data = optionChain.oc[s.toFixed(6)] || optionChain.oc[s];
            const callOI = data?.ce?.oi || 0;
            const putOI = data?.pe?.oi || 0;

            // Call Loss if spot expires at testStrike > s
            if (testStrike > s) {
                totalPain += (testStrike - s) * callOI;
            }
            // Put Loss if spot expires at testStrike < s
            if (testStrike < s) {
                totalPain += (s - testStrike) * putOI;
            }
        });

        if (totalPain < minTotalPain) {
            minTotalPain = totalPain;
            maxPainStrike = testStrike;
        }
    });

    return { maxPainStrike, minTotalPain };
}

module.exports = { calculateMaxPain };
