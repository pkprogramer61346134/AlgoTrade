/**
 * Option SL & Target (TR1, TR2, TR3, TR4) Calculator Utility
 * Location: C:\AlgoTrade\utility\usedfull\option-sl-target.js
 * 
 * Features:
 * 1. Fetches recent historical option candles via option-historicaldata.js.
 * 2. Calculates Option Stop Loss (SL) and 4 Targets (TR1, TR2, TR3, TR4) using Option Price Action & ATR.
 * 3. Supports multiple methods: "ATR", "SWING", "HYBRID" (default).
 * 4. Provides structured output ready for Paper Trade Engine, Live Engine, and UI rendering.
 */

const { getCachedOptionCandles } = require("./option-historicaldata");

/**
 * Calculate ATR (Average True Range) for option candles
 */
function calculateOptionATR(candles, period = 14) {
    if (!Array.isArray(candles) || candles.length < 2) return 1.5;

    const trValues = [];
    for (let i = 1; i < candles.length; i++) {
        const high = Number(candles[i].candleHigh || candles[i].high || 0);
        const low = Number(candles[i].candleLow || candles[i].low || 0);
        const prevClose = Number(candles[i - 1].candleClose || candles[i - 1].close || 0);

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trValues.push(tr);
    }

    if (trValues.length === 0) return 1.5;
    const slice = trValues.slice(-period);
    const sum = slice.reduce((acc, val) => acc + val, 0);
    return Number((sum / slice.length).toFixed(2)) || 1.5;
}

/**
 * Main Calculator Function: Calculate Option SL & Multiple Targets (TR1 - TR4)
 * 
 * @param {Object} params
 * @param {string|number} params.securityId - Option Contract Security ID (e.g. "74068")
 * @param {number} [params.entryPrice] - Option Entry LTP (If omitted, uses latest candle close)
 * @param {string} [params.interval="5"] - Candle interval in minutes ("1", "5", "15")
 * @param {string} [params.method="HYBRID"] - "ATR" | "SWING" | "HYBRID"
 * @param {number} [params.atrMultiplier=1.5] - ATR Multiplier for SL
 * @param {number} [params.count=50] - Number of option candles to analyze
 * @returns {Promise<Object>} Object containing Entry, SL, TR1, TR2, TR3, TR4 and percentages
 */
async function calculateOptionSLAndTargets(params = {}) {
    if (!params.securityId) {
        throw new Error("securityId (Option Security ID) is required for calculateOptionSLAndTargets()");
    }

    const securityId = String(params.securityId);
    const interval = String(params.interval || "5");
    const method = (params.method || "HYBRID").toUpperCase();
    const atrMultiplier = Number(params.atrMultiplier || 1.5);
    const candleCount = Number(params.count || 50);

    // 1. Fetch Option Historical Candles
    const candleRes = await getCachedOptionCandles({
        securityId: securityId,
        count: candleCount,
        interval: interval
    });

    const candles = candleRes.data || [];
    if (candles.length === 0) {
        throw new Error(`No option candle data found for securityId: ${securityId}`);
    }

    const latestCandle = candles[candles.length - 1];
    const entryLtp = Number(params.entryPrice || latestCandle.candleClose || latestCandle.price || 0);

    if (entryLtp <= 0) {
        throw new Error(`Invalid Option Entry LTP: ₹${entryLtp}`);
    }

    // 2. Compute Technical Indicators (ATR, Swing Low, Swing High)
    const atr = calculateOptionATR(candles, 14);

    // Recent 10 candles swing low & swing high
    const recentSlice = candles.slice(-10);
    const swingLow = Math.min(...recentSlice.map(c => Number(c.candleLow || c.low || entryLtp)));
    const swingHigh = Math.max(...recentSlice.map(c => Number(c.candleHigh || c.high || entryLtp)));

    let optionSl = 0;

    if (method === "ATR") {
        optionSl = Math.max(0.1, Number((entryLtp - (atr * atrMultiplier)).toFixed(2)));
    } else if (method === "SWING") {
        const buffer = atr * 0.2;
        optionSl = Math.max(0.1, Number((swingLow - buffer).toFixed(2)));
    } else {
        // HYBRID: Use closer SL of ATR or Swing Low to prevent overly deep SL, capped at max 25% risk
        const atrSl = entryLtp - (atr * atrMultiplier);
        const swingSl = swingLow - (atr * 0.2);
        const maxSlCap = entryLtp * 0.75; // Max 25% loss cap on option LTP
        optionSl = Math.max(0.1, maxSlCap, Number(Math.max(atrSl, swingSl).toFixed(2)));
    }

    // Risk Amount per Option Unit
    const riskAmount = Number(Math.max(0.1, entryLtp - optionSl).toFixed(2));
    const slPercent = Number(((riskAmount / entryLtp) * 100).toFixed(2));

    // 3. Compute 5 Targets (TR1, TR2, TR3, TR4, TR5) based on Risk:Reward Ratios (1:1 to 1:5)
    const tr1 = Number((entryLtp + (riskAmount * 1.0)).toFixed(2));
    const tr2 = Number((entryLtp + (riskAmount * 2.0)).toFixed(2));
    const tr3 = Number((entryLtp + (riskAmount * 3.0)).toFixed(2));
    const tr4 = Number((entryLtp + (riskAmount * 4.0)).toFixed(2));
    const tr5 = Number((entryLtp + (riskAmount * 5.0)).toFixed(2));

    const tr1Percent = Number((((tr1 - entryLtp) / entryLtp) * 100).toFixed(2));
    const tr2Percent = Number((((tr2 - entryLtp) / entryLtp) * 100).toFixed(2));
    const tr3Percent = Number((((tr3 - entryLtp) / entryLtp) * 100).toFixed(2));
    const tr4Percent = Number((((tr4 - entryLtp) / entryLtp) * 100).toFixed(2));
    const tr5Percent = Number((((tr5 - entryLtp) / entryLtp) * 100).toFixed(2));

    return {
        status: "success",
        securityId: securityId,
        method: method,
        entryPrice: entryLtp,
        indicators: {
            atr: atr,
            swingLow: swingLow,
            swingHigh: swingHigh
        },
        risk: {
            riskAmount: riskAmount,
            slPercent: `-${slPercent}%`
        },
        stopLoss: {
            sl: optionSl,
            slPercent: `-${slPercent}%`
        },
        targets: {
            tr1: { price: tr1, gain: Number((tr1 - entryLtp).toFixed(2)), percent: `+${tr1Percent}%`, ratio: "1:1" },
            tr2: { price: tr2, gain: Number((tr2 - entryLtp).toFixed(2)), percent: `+${tr2Percent}%`, ratio: "1:2" },
            tr3: { price: tr3, gain: Number((tr3 - entryLtp).toFixed(2)), percent: `+${tr3Percent}%`, ratio: "1:3" },
            tr4: { price: tr4, gain: Number((tr4 - entryLtp).toFixed(2)), percent: `+${tr4Percent}%`, ratio: "1:4" },
            tr5: { price: tr5, gain: Number((tr5 - entryLtp).toFixed(2)), percent: `+${tr5Percent}%`, ratio: "1:5" }
        }
    };
}

module.exports = {
    calculateOptionSLAndTargets,
    calculateOptionATR
};
