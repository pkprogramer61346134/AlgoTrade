/**
 * TRAILING SL MANAGER
 * 
 * Class responsible for:
 * 1. 1R Breathing Room Trailing SL Progression calculation.
 * 2. Evaluating Milestone Ratios (1:1.5, 1:2.5, 1:3.0, 1:3.5, 1:5.0+).
 * 3. Checking Target Profit (TP) and Trailing SL hit triggers.
 */
class TrailingSLManager {
    /**
     * @param {Array<number>} [customSteps] - Custom milestone ratio steps
     * @param {number} [defaultRiskPts=15.0] - Default initial SL risk points
     */
    constructor(customSteps = null, defaultRiskPts = 15.0) {
        this.trailingRatioSteps = customSteps || [1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        this.defaultRiskPts = defaultRiskPts;
    }

    /**
     * Evaluates Trailing SL progression for an active position on each price tick.
     * 
     * @param {Object} activePosition - Active position object
     * @param {number} currentLtp - Current live option LTP
     * @returns {Object} { slUpdated: boolean, newTrailingSL: number, milestoneText: string, updatedPosition: Object }
     */
    evaluateTrailingSL(activePosition, currentLtp) {
        if (!activePosition || !currentLtp || currentLtp <= 0) {
            return { slUpdated: false, newTrailingSL: activePosition?.currentTrailingSL || 0, updatedPosition: activePosition };
        }

        const ltp = Number(currentLtp.toFixed(2));
        activePosition.currentLtp = ltp;

        // 1. Update Peak High Price
        if (ltp > (activePosition.highestPriceSeen || activePosition.entryPrice)) {
            activePosition.highestPriceSeen = ltp;
        }

        const riskPts = activePosition.riskPoints && activePosition.riskPoints > 0 ? activePosition.riskPoints : this.defaultRiskPts;
        const gainedPoints = activePosition.highestPriceSeen - activePosition.entryPrice;
        const currentRRRatio = gainedPoints / riskPts;

        let slUpdated = false;
        let newTrailingSL = activePosition.currentTrailingSL;
        let milestoneText = activePosition.currentRatioText || "1:0";

        // 2. Evaluate Trailing Milestones
        for (let i = this.trailingRatioSteps.length - 1; i >= 0; i--) {
            const milestoneRatio = this.trailingRatioSteps[i];
            if (currentRRRatio >= milestoneRatio && i > (activePosition.currentMilestoneIndex ?? -1)) {
                activePosition.currentMilestoneIndex = i;
                milestoneText = `1:${milestoneRatio}`;
                activePosition.currentRatioText = milestoneText;

                // 1R Breathing Room Formula:
                const lockedRRatio = Math.max(0, milestoneRatio - 1.0);
                const calcSL = Number((activePosition.entryPrice + (lockedRRatio * riskPts)).toFixed(2));

                if (calcSL > activePosition.currentTrailingSL) {
                    newTrailingSL = calcSL;
                    activePosition.currentTrailingSL = calcSL;
                    slUpdated = true;
                    console.log(`📈 [TRAILING SL MANAGER] Milestone ${milestoneText} Reached! Peak: ₹${activePosition.highestPriceSeen} | New Trailing SL: ₹${newTrailingSL}`);
                }
                break;
            }
        }

        return {
            slUpdated,
            newTrailingSL,
            milestoneText,
            updatedPosition: activePosition
        };
    }

    /**
     * Checks if current LTP triggers Target Profit or Trailing SL exit
     * 
     * @param {Object} activePosition - Active position object
     * @param {number} currentLtp - Current live option LTP
     * @returns {'TARGET_PROFIT_HIT'|'TRAILING_SL_HIT'|null} Exit reason or null
     */
    checkExitTriggers(activePosition, currentLtp) {
        if (!activePosition || !currentLtp || currentLtp <= 0) return null;

        const ltp = Number(currentLtp.toFixed(2));

        // Target Profit Hit Check
        if (activePosition.targetProfit && ltp >= activePosition.targetProfit) {
            return "TARGET_PROFIT_HIT";
        }

        // Trailing SL Hit Check
        if (activePosition.currentTrailingSL && ltp <= activePosition.currentTrailingSL) {
            return "TRAILING_SL_HIT";
        }

        return null;
    }
}

module.exports = TrailingSLManager;
