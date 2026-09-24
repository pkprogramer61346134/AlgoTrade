/**
 * Liquidity Sweep Price Action Indicator
 */
function calculateLiquiditySweepIndicator(candles) {
    if (!candles || candles.length === 0) return null;
    const last = candles[candles.length - 1];
    return {
        isBullishSweep: last ? last.low < last.open && last.close > last.open : false,
        isBearishSweep: last ? last.high > last.open && last.close < last.open : false
    };
}

module.exports = {
    calculateLiquiditySweepIndicator
};
