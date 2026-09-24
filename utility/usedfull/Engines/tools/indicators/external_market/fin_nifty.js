/**
 * Analyzes Fin Nifty relative performance
 * @param {number} finNiftyChangePct 
 * @param {number} niftyChangePct 
 */
function analyzeFinNiftyCorrelation(finNiftyChangePct, niftyChangePct) {
    let status = "ALIGNED";
    if (finNiftyChangePct > 0 && niftyChangePct < 0) status = "FIN_NIFTY_LEADING";
    else if (finNiftyChangePct < 0 && niftyChangePct > 0) status = "FIN_NIFTY_LAGGING";

    return { finNiftyChangePct, niftyChangePct, status };
}

module.exports = { analyzeFinNiftyCorrelation };
