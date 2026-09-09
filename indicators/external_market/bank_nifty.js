/**
 * Calculates inter-market performance & correlation between Bank Nifty and Nifty 50
 * @param {number} bankNiftyChangePct 
 * @param {number} niftyChangePct 
 */
function analyzeBankNiftyCorrelation(bankNiftyChangePct, niftyChangePct) {
    let status = "ALIGNED";
    if (bankNiftyChangePct > 0 && niftyChangePct < 0) status = "BANK_NIFTY_OUTPERFORMING";
    else if (bankNiftyChangePct < 0 && niftyChangePct > 0) status = "BANK_NIFTY_UNDERPERFORMING";

    return {
        bankNiftyChangePct,
        niftyChangePct,
        status
    };
}

module.exports = { analyzeBankNiftyCorrelation };
