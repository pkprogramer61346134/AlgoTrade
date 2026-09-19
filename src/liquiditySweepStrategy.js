/**
 * INSTITUTIONAL LIQUIDITY SWEEP & STOP-HUNT REVERSAL STRATEGY
 * 
 * Detects Smart Money Concepts (SMC) Liquidity Grabs around key price pools:
 * 1. Previous Day High / Low (PDH / PDL)
 * 2. Opening Range High / Low (ORH / ORL)
 * 3. Multi-candle Swing High / Swing Low (20-candle lookback)
 * 
 * Pattern:
 * - Price spikes beyond liquidity level (sweeping retail stop losses)
 * - Immediate rejection (Pinbar / Hammer / Lower or Upper Wick >= 40%)
 * - Close back inside range (Reclamation of level)
 */

class LiquiditySweepStrategy {
    /**
     * Find Key Liquidity Reference Levels (PDH, PDL, ORH, ORL, Swing High, Swing Low)
     */
    static findLiquidityPools(candles, index, lookback = 20) {
        if (index < 1) return null;
        const currentCandle = candles[index];
        const currentDate = currentCandle.date;

        // 1. Calculate 20-candle Swing High & Swing Low (excluding current candle)
        const startIdx = Math.max(0, index - lookback);
        let swingHigh = -Infinity;
        let swingLow = Infinity;

        for (let k = startIdx; k < index; k++) {
            if (candles[k].date === currentDate) {
                if (candles[k].high > swingHigh) swingHigh = candles[k].high;
                if (candles[k].low < swingLow) swingLow = candles[k].low;
            }
        }

        // 2. Calculate Day ORB High & Low
        let orh = -Infinity;
        let orl = Infinity;
        for (let k = 0; k <= index; k++) {
            if (candles[k].date === currentDate) {
                const timeStr = candles[k].time || '09:15';
                const parts = timeStr.split(':').map(Number);
                const mins = parts[0] * 60 + (parts[1] || 0);
                if (mins <= 570) { // First 15 minutes (9:15 to 9:30 AM)
                    if (candles[k].high > orh) orh = candles[k].high;
                    if (candles[k].low < orl) orl = candles[k].low;
                }
            }
        }

        // 3. Find Previous Day High & Low
        let pdh = null;
        let pdl = null;
        let prevDate = null;
        for (let k = index - 1; k >= 0; k--) {
            if (candles[k].date !== currentDate) {
                prevDate = candles[k].date;
                break;
            }
        }
        if (prevDate) {
            let pHigh = -Infinity;
            let pLow = Infinity;
            for (let k = 0; k < index; k++) {
                if (candles[k].date === prevDate) {
                    if (candles[k].high > pHigh) pHigh = candles[k].high;
                    if (candles[k].low < pLow) pLow = candles[k].low;
                }
            }
            if (pHigh !== -Infinity) pdh = pHigh;
            if (pLow !== Infinity) pdl = pLow;
        }

        return {
            swingHigh: swingHigh !== -Infinity ? swingHigh : null,
            swingLow: swingLow !== Infinity ? swingLow : null,
            orh: orh !== -Infinity ? orh : null,
            orl: orl !== Infinity ? orl : null,
            pdh,
            pdl
        };
    }

    /**
     * Detect Liquidity Sweep / Stop Hunt Reversal
     */
    static detectLiquiditySweep(candles, index) {
        if (index < 5) return { type: "NONE", isSweep: false };

        const c = candles[index];
        const prevC = candles[index - 1];
        const pools = this.findLiquidityPools(candles, index, 20);
        if (!pools) return { type: "NONE", isSweep: false };

        const range = Math.max(0.1, c.high - c.low);
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const upperWick = c.high - Math.max(c.open, c.close);

        const lowerWickPct = (lowerWick / range) * 100;
        const upperWickPct = (upperWick / range) * 100;

        // Check Bullish Sweep (Sweep of Lows)
        const sweptLowLevel = (pools.swingLow && c.low < pools.swingLow) ||
                             (pools.orl && c.low < pools.orl) ||
                             (pools.pdl && c.low < pools.pdl);

        if (sweptLowLevel) {
            const levelRef = (pools.swingLow && c.low < pools.swingLow) ? pools.swingLow :
                             ((pools.orl && c.low < pools.orl) ? pools.orl : pools.pdl);

            const isRejection = lowerWickPct >= 40.0 || c.close > levelRef;
            const isBullishClose = c.close >= c.open || (prevC && c.close > prevC.high);

            if (isRejection && isBullishClose) {
                const stopLoss = Number((c.low - 4.0).toFixed(2));
                const riskPts = c.close - stopLoss;
                const targetPrice = Number((c.close + (riskPts * 2.0)).toFixed(2));

                return {
                    type: "BUY",
                    signal: "BULLISH_LIQUIDITY_SWEEP",
                    isSweep: true,
                    sweptLevel: levelRef,
                    entryPrice: c.close,
                    stopLoss,
                    targetPrice,
                    wickPct: Number(lowerWickPct.toFixed(1)),
                    details: `Bullish Sweep of Low ₹${levelRef} | Lower Wick: ${lowerWickPct.toFixed(1)}%`
                };
            }
        }

        // Check Bearish Sweep (Sweep of Highs)
        const sweptHighLevel = (pools.swingHigh && c.high > pools.swingHigh) ||
                              (pools.orh && c.high > pools.orh) ||
                              (pools.pdh && c.high > pools.pdh);

        if (sweptHighLevel) {
            const levelRef = (pools.swingHigh && c.high > pools.swingHigh) ? pools.swingHigh :
                             ((pools.orh && c.high > pools.orh) ? pools.orh : pools.pdh);

            const isRejection = upperWickPct >= 40.0 || c.close < levelRef;
            const isBearishClose = c.close <= c.open || (prevC && c.close < prevC.low);

            if (isRejection && isBearishClose) {
                const stopLoss = Number((c.high + 4.0).toFixed(2));
                const riskPts = stopLoss - c.close;
                const targetPrice = Number((c.close - (riskPts * 2.0)).toFixed(2));

                return {
                    type: "SELL",
                    signal: "BEARISH_LIQUIDITY_SWEEP",
                    isSweep: true,
                    sweptLevel: levelRef,
                    entryPrice: c.close,
                    stopLoss,
                    targetPrice,
                    wickPct: Number(upperWickPct.toFixed(1)),
                    details: `Bearish Sweep of High ₹${levelRef} | Upper Wick: ${upperWickPct.toFixed(1)}%`
                };
            }
        }

        return { type: "NONE", isSweep: false };
    }

    /**
     * Check if price is sitting inside a Major Support/Demand Zone or Resistance/Supply Zone.
     * Prevents selling PE at the bottom of a support zone or buying CE at the top of a resistance zone.
     */
    static checkZoneProtection(candles, index) {
        if (index < 5) return { blockPE: false, blockCE: false };
        const c = candles[index];
        const pools = this.findLiquidityPools(candles, index, 20);
        if (!pools) return { blockPE: false, blockCE: false };

        const range = Math.max(0.1, c.high - c.low);
        const lowerWickPct = ((Math.min(c.open, c.close) - c.low) / range) * 100;
        const upperWickPct = ((c.high - Math.max(c.open, c.close)) / range) * 100;

        let blockPE = false;
        let blockCE = false;

        // Block PE if price is near Support (SwingLow, ORL, PDL) OR lower wick >= 35%
        const nearSupport = (pools.swingLow && (c.low <= pools.swingLow + 10)) ||
                            (pools.orl && (c.low <= pools.orl + 10)) ||
                            (pools.pdl && (c.low <= pools.pdl + 10));

        if (nearSupport || lowerWickPct >= 35.0) {
            blockPE = true;
        }

        // Block CE if price is near Resistance (SwingHigh, ORH, PDH) OR upper wick >= 35%
        const nearResistance = (pools.swingHigh && (c.high >= pools.swingHigh - 10)) ||
                               (pools.orh && (c.high >= pools.orh - 10)) ||
                               (pools.pdh && (c.high >= pools.pdh - 10));

        if (nearResistance || upperWickPct >= 35.0) {
            blockCE = true;
        }

        return { blockPE, blockCE, nearSupport, nearResistance, lowerWickPct, upperWickPct };
    }

    /**
     * Calculate Liquidity Sweep Indicator Array across full dataset
     * Enables Liquidity Sweep to be used seamlessly like standard indicators (EMA, RSI, ATR)
     */
    static calculateLiquiditySweepIndicator(candles) {
        if (!Array.isArray(candles) || candles.length === 0) return [];

        const result = new Array(candles.length);
        for (let i = 0; i < candles.length; i++) {
            const sweep = LiquiditySweepStrategy.detectLiquiditySweep(candles, i);
            const zone = LiquiditySweepStrategy.checkZoneProtection(candles, i);

            result[i] = {
                isSweep: sweep.isSweep,
                sweepType: sweep.type, // "BUY", "SELL", "NONE"
                signal: sweep.signal || "NONE",
                sweptLevel: sweep.sweptLevel || null,
                entryPrice: sweep.entryPrice || candles[i].close,
                stopLoss: sweep.stopLoss || null,
                targetPrice: sweep.targetPrice || null,
                wickPct: sweep.wickPct || 0,
                details: sweep.details || "",
                blockPE: zone.blockPE,
                blockCE: zone.blockCE
            };
        }
        return result;
    }
}

module.exports = LiquiditySweepStrategy;
