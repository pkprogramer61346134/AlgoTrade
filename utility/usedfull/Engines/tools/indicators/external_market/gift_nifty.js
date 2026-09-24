/**
 * Evaluates GIFT Nifty price vs Nifty Spot to estimate Opening Gap (Gap Up / Gap Down)
 * @param {number} giftNiftyPrice 
 * @param {number} niftyPrevClose 
 */
function analyzeGiftNifty(giftNiftyPrice, niftyPrevClose) {
    if (!giftNiftyPrice || !niftyPrevClose) return { estimatedGap: 0, gapType: "FLAT" };

    const gap = giftNiftyPrice - niftyPrevClose;
    let gapType = "FLAT";
    if (gap > 30) gapType = "GAP_UP";
    else if (gap < -30) gapType = "GAP_DOWN";

    return {
        giftNiftyPrice,
        niftyPrevClose,
        estimatedGap: Number(gap.toFixed(2)),
        gapType
    };
}

module.exports = { analyzeGiftNifty };
