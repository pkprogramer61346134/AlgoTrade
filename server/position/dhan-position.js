/**
 * Position Checker
 *
 * Uses utility/dhan-position.js (DhanPosition class).
 * checkPosition() -> true  : open position exists (netQty != 0)
 *                 -> false : no open position
 *                 -> throws: real API / network error (no fallback, no fake data)
 */

const { DhanPosition } = require("../../utility/dhan-position");

class PositionChecker {
    constructor(options = {}) {
        this.dhanPosition = new DhanPosition(options);
    }

    async checkPosition() {
        const result = await this.dhanPosition.getPosition();

        if (result?.status !== "success") {
            throw new Error(result?.message || "Dhan positions API failed");
        }

        if (!Array.isArray(result.data)) {
            throw new Error("Invalid response from Dhan positions API");
        }

        return result.data.some(position => Number(position.netQty) !== 0);
    }
}

module.exports = PositionChecker;
