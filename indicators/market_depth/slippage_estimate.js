const { getTop5Depth } = require('./top5_depth');

/**
 * Estimates Execution Slippage for a market order of given quantity
 * @param {Object} marketQuote - Dhan Market Quote object
 * @param {number} orderQuantity - Desired order quantity
 * @param {string} side - "BUY" or "SELL"
 */
function estimateSlippage(marketQuote, orderQuantity = 100, side = "BUY") {
    const { top5Bids, top5Asks } = getTop5Depth(marketQuote);
    const depthList = side === "BUY" ? top5Asks : top5Bids;

    if (!depthList || depthList.length === 0) return { estimatedSlippage: 0, avgFilledPrice: 0 };

    let remainingQty = orderQuantity;
    let totalCost = 0;
    const initialPrice = depthList[0].price || 0;

    for (const level of depthList) {
        const qtyAtLevel = level.quantity || level.qty || 0;
        const priceAtLevel = level.price || 0;

        const filledAtThisLevel = Math.min(remainingQty, qtyAtLevel);
        totalCost += filledAtThisLevel * priceAtLevel;
        remainingQty -= filledAtThisLevel;

        if (remainingQty <= 0) break;
    }

    const filledQty = orderQuantity - remainingQty;
    const avgFilledPrice = filledQty > 0 ? (totalCost / filledQty) : initialPrice;
    const slippage = Math.abs(avgFilledPrice - initialPrice);

    return {
        initialPrice,
        avgFilledPrice: Number(avgFilledPrice.toFixed(2)),
        estimatedSlippage: Number(slippage.toFixed(2)),
        isFullyFilled: remainingQty <= 0
    };
}

module.exports = { estimateSlippage };
