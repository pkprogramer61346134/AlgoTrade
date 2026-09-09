/**
 * Calculates Standard, Fibonacci, and Camarilla Pivot Points
 * @param {number} high - High price of previous period
 * @param {number} low - Low price of previous period
 * @param {number} close - Close price of previous period
 */
function calculatePivotPoints(high, low, close) {
    if (high === undefined || low === undefined || close === undefined) {
        return null;
    }

    const P = (high + low + close) / 3;
    const range = high - low;

    // Standard Pivots
    const standard = {
        P,
        R1: (2 * P) - low,
        S1: (2 * P) - high,
        R2: P + range,
        S2: P - range,
        R3: high + 2 * (P - low),
        S3: low - 2 * (high - P)
    };

    // Fibonacci Pivots
    const fibonacci = {
        P,
        R1: P + (0.382 * range),
        S1: P - (0.382 * range),
        R2: P + (0.618 * range),
        S2: P - (0.618 * range),
        R3: P + (1.000 * range),
        S3: P - (1.000 * range)
    };

    // Camarilla Pivots
    const camarilla = {
        P,
        R1: close + (range * 1.1 / 12),
        S1: close - (range * 1.1 / 12),
        R2: close + (range * 1.1 / 6),
        S2: close - (range * 1.1 / 6),
        R3: close + (range * 1.1 / 4),
        S3: close - (range * 1.1 / 4),
        R4: close + (range * 1.1 / 2),
        S4: close - (range * 1.1 / 2)
    };

    return { standard, fibonacci, camarilla };
}

module.exports = { calculatePivotPoints };
