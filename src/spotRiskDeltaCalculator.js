/**
 * SPOT RISK & OPTION DELTA CALCULATOR COMPONENT
 * 
 * Standalone, institutional-grade calculation module.
 * Analyzes Spot Price chart structure (Entry, SL, Target) and maps them to
 * Option Strike Premiums using Option Delta sensitivity (~0.50 ATM).
 */

class SpotRiskDeltaCalculator {
    /**
     * Calculate Spot Chart Structure (Entry, SL & Target)
     */
    static calculateSpotChartStructure(params) {
        const {
            spotPrice,
            signalType = "BUY",
            stopLoss = null,
            targetPrice = null,
            atrVal = 15.0,
            orbLow = null,
            orbHigh = null,
            riskRewardRatio = 2.0
        } = params;

        const entryPrice = Number(spotPrice);

        // Dynamic Stop Loss Calculation (ORB Structural / ATR Volatility Adaptive)
        let spotSL;
        if (stopLoss !== null && stopLoss !== undefined && !isNaN(Number(stopLoss))) {
            spotSL = Number(stopLoss);
        } else {
            const isBuy = signalType === "BUY" || signalType === "BUY_SIGNAL" || signalType === "CE";
            let orbRisk = 20.0;
            if (orbLow !== null && orbHigh !== null) {
                orbRisk = Math.abs(entryPrice - (isBuy ? orbLow : orbHigh));
            }
            const minSL = Math.max(15.0, (atrVal || 15.0) * 1.0);
            const maxSL = Math.max(35.0, (atrVal || 15.0) * 2.5);
            const dynamicSLPoints = Math.max(minSL, Math.min(maxSL, orbRisk));
            spotSL = isBuy ? (entryPrice - dynamicSLPoints) : (entryPrice + dynamicSLPoints);
        }

        const spotRiskPoints = Math.max(5.0, Math.abs(entryPrice - spotSL));

        // Fixed 1:2.0 Risk-Reward Target Calculation on Spot Chart Structure
        let rawRR = riskRewardRatio || 2.0;
        if (typeof rawRR === 'string' && rawRR.includes(':')) {
            rawRR = 2.0;
        }
        const rrMultiplier = !isNaN(Number(rawRR)) ? Number(rawRR) : 2.0;

        let spotTarget;
        if (targetPrice !== null && targetPrice !== undefined && !isNaN(Number(targetPrice))) {
            spotTarget = Number(targetPrice);
        } else {
            const isBuy = signalType === "BUY" || signalType === "BUY_SIGNAL" || signalType === "CE";
            const spotTargetPts = Number((spotRiskPoints * rrMultiplier).toFixed(2));
            spotTarget = isBuy ? Number((entryPrice + spotTargetPts).toFixed(2)) : Number((entryPrice - spotTargetPts).toFixed(2));
        }

        const spotTargetPoints = Math.abs(spotTarget - entryPrice);

        return {
            entryPrice,
            spotSL: Number(spotSL.toFixed(2)),
            spotTarget: Number(spotTarget.toFixed(2)),
            spotRiskPoints: Number(spotRiskPoints.toFixed(2)),
            spotTargetPoints: Number(spotTargetPoints.toFixed(2)),
            rrMultiplier,
            ratioXXStr: `${spotRiskPoints.toFixed(1)}:${spotTargetPoints.toFixed(1)}`
        };
    }

    /**
     * Map Spot Price Chart Levels to Option Strike Price via Option Delta & Dhan API Data
     */
    static mapSpotToOptionDelta(params) {
        const {
            spotPrice,
            spotSL,
            spotTarget,
            optionPremiumPrice,
            atmStrike = null,
            optionType = "CE",
            maxRiskPtsCap = 100,
            delta = null
        } = params;

        // Dynamic Delta Calculation based on Real Dhan API Spot & Strike Moneyness
        let effectiveDelta = typeof delta === 'number' && delta > 0 ? delta : 0.50;
        if (!delta && atmStrike && spotPrice && atmStrike > 0) {
            const strikeDiff = Math.abs(spotPrice - atmStrike);
            if (strikeDiff < 25) {
                effectiveDelta = 0.50; // ATM Delta
            } else if ((optionType === "CE" && spotPrice > atmStrike) || (optionType === "PE" && spotPrice < atmStrike)) {
                effectiveDelta = Math.min(0.85, Number((0.50 + (strikeDiff / 50) * 0.08).toFixed(2))); // ITM Delta
            } else {
                effectiveDelta = Math.max(0.25, Number((0.50 - (strikeDiff / 50) * 0.08).toFixed(2))); // OTM Delta
            }
        }

        const spotRiskPts = Math.max(5.0, Math.abs(spotPrice - spotSL));
        const spotTargetPts = Math.abs(spotTarget - spotPrice);

        // Map via Effective Delta & Apply 80.5% Target Profit Booking Rule
        const calculatedOptionRisk = Number((spotRiskPts * effectiveDelta).toFixed(2));
        const premiumRiskPoints = Math.max(3.0, Math.min(maxRiskPtsCap, calculatedOptionRisk));
        const rawPremiumTargetPoints = spotTargetPts * effectiveDelta;
        const premiumTargetPoints = Number((rawPremiumTargetPoints * 0.805).toFixed(2)); // 80.5% Target Booking Cap

        const optionSL = Math.max(1.0, Number((optionPremiumPrice - premiumRiskPoints).toFixed(2)));
        const optionTarget = Number((optionPremiumPrice + premiumTargetPoints).toFixed(2));

        return {
            optionPremiumPrice: Number(optionPremiumPrice.toFixed(2)),
            effectiveDelta,
            premiumRiskPoints,
            premiumTargetPoints,
            optionSL,
            optionTarget
        };
    }

    /**
     * Evaluate Dual-Layer Exit Conditions (Spot Chart Levels + Option Premium Levels)
     */
    static evaluateDualLayerExit(params) {
        const {
            currentSpotPrice,
            currentOptionPremium,
            activePosition,
            totalMins
        } = params;

        const pos = activePosition;
        const targetPrice = pos.target || pos.currentTarget || pos.target1;
        const isCE = pos.optionType === "CE";

        const isSpotTargetHit = pos.spotTarget && (isCE ? currentSpotPrice >= pos.spotTarget : currentSpotPrice <= pos.spotTarget);
        const isSpotSLHit = pos.spotSL && (isCE ? currentSpotPrice <= pos.spotSL : currentSpotPrice >= pos.spotSL);

        let exitTriggered = false;
        let exitReason = "";
        let exitPrice = currentOptionPremium;

        if (totalMins >= 900) { // 3:00 PM IST Market Close Exit
            exitTriggered = true;
            exitReason = currentOptionPremium >= pos.optionPremiumPrice ? "3:00 PM EOD PROFIT BOOKED" : "3:00 PM EOD LOSS BOOKED";
            exitPrice = currentOptionPremium;
        } else if (currentOptionPremium >= targetPrice || isSpotTargetHit) {
            exitTriggered = true;
            exitReason = "TARGET_HIT";
            exitPrice = Math.max(currentOptionPremium, targetPrice);
        } else if (currentOptionPremium <= pos.currentSL || isSpotSLHit) {
            exitTriggered = true;
            exitReason = "SL_HIT";
            exitPrice = pos.currentSL;
        }

        return {
            exitTriggered,
            exitReason,
            exitPrice
        };
    }
}

module.exports = SpotRiskDeltaCalculator;
