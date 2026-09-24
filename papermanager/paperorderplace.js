/**
 * PAPER ORDER PLACE MANAGER
 * 
 * Class responsible for:
 * 1. placePaperOrder - Simulating paper market BUY order execution with SL & Target Profit.
 * 2. closePaperOrder - Simulating paper market SELL order exit and calculating net paper PnL.
 */
class PaperOrderPlace {
    /**
     * Simulates Paper Market BUY Order placement with Initial SL & Target Profit (TP)
     * 
     * @param {Object} strikeDetails - { symbol, securityId, strikePrice, optionType, liveLtp, qty, requiredMargin }
     * @param {number} [riskPoints=15.0] - SL risk points per share
     * @param {number} [rrRatio=2.2] - Risk-to-Reward ratio for Target Profit
     * @returns {Object} Active paper position state object
     */
    placePaperOrder(strikeDetails, riskPoints = 15.0, rrRatio = 2.2) {
        if (!strikeDetails || !strikeDetails.symbol || !strikeDetails.liveLtp) {
            throw new Error(`[PAPER ORDER PLACE ERROR] Invalid strike details provided.`);
        }

        const symbol = strikeDetails.symbol;
        const securityId = String(strikeDetails.securityId || '');
        const qty = strikeDetails.qty || 65; // Default 1 Lot Nifty = 65 Qty
        const entryPrice = Number(strikeDetails.liveLtp.toFixed(2));

        if (entryPrice <= 0) {
            throw new Error(`[PAPER ORDER PLACE ERROR] Invalid entry price: ₹${entryPrice}`);
        }

        const initialSL = Number((entryPrice - riskPoints).toFixed(2));
        const targetProfit = Number((entryPrice + (riskPoints * rrRatio)).toFixed(2));

        const activePosition = {
            mode: 'PAPER_TRADING',
            symbol,
            securityId,
            strikePrice: strikeDetails.strikePrice,
            optionType: strikeDetails.optionType,
            entryPrice,
            qty,
            initialSL,
            currentTrailingSL: initialSL,
            targetProfit,
            riskPoints,
            highestPriceSeen: entryPrice,
            unrealizedPnl: 0.0,
            pnlPercentage: 0.0,
            currentLtp: entryPrice,
            currentMilestoneIndex: -1,
            currentRatioText: '1:0',
            openedAt: new Date().toLocaleTimeString()
        };

        console.log(`📝 [PAPER ORDER PLACE] Virtual Market BUY Executed for ${symbol} @ ₹${entryPrice} | SL: ₹${initialSL} | Target: ₹${targetProfit}`);
        return activePosition;
    }

    /**
     * Simulates Paper Market SELL Order exit
     * 
     * @param {Object} activePosition - Active paper position object
     * @param {string} [reason="MANUAL_EXIT"] - Exit trigger reason
     * @returns {Object} Closed paper order summary record
     */
    closePaperOrder(activePosition, reason = "MANUAL_EXIT") {
        if (!activePosition) return null;

        const exitPrice = Number((activePosition.currentLtp || activePosition.entryPrice).toFixed(2));
        const netPnl = Number(((exitPrice - activePosition.entryPrice) * activePosition.qty).toFixed(2));

        const closedRecord = {
            ...activePosition,
            exitPrice,
            netPnl,
            reason,
            closedAt: new Date().toLocaleTimeString()
        };

        console.log(`🏁 [PAPER ORDER PLACE EXIT] Paper Trade Closed for ${activePosition.symbol} | Exit: ₹${exitPrice} | Net PnL: ${netPnl >= 0 ? '+' : ''}₹${netPnl} | Reason: ${reason}`);
        return closedRecord;
    }
}

module.exports = PaperOrderPlace;
