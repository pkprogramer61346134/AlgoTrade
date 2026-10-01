/**
 * Reversal & Liquidity Sweep Signal Filter (reversal.js)
 * Location: C:\AlgoTrade\server\reversalTest\reversal.js
 * 
 * Workflow & Concept:
 * 1. Receives raw consensus signal (BUY or SELL) from strategy consensus engine.
 * 2. Instead of placing real trade immediately, enters WATCHING_REVERSAL state.
 * 3. BUY Reversal Sweep Logic:
 *    - Stage 1 (WATCH_DIP): Waits for price to dip/reverse BELOW original entry price (Liquidity Sweep).
 *    - Stage 2 (CONFIRM_REENTRY): After dip, waits for candle to CLOSE back AT or ABOVE entry price.
 *    - Once Stage 2 closes back above entry, signal is CONFIRMED and passed to Real Trading Engine.
 * 4. SELL Reversal Sweep Logic:
 *    - Stage 1 (WATCH_RALLY): Waits for price to rally/reverse ABOVE original entry price (Liquidity Sweep).
 *    - Stage 2 (CONFIRM_REENTRY): After rally, waits for candle to CLOSE back AT or BELOW entry price.
 *    - Once Stage 2 closes back below entry, signal is CONFIRMED and passed to Real Trading Engine.
 * 5. Expiry Guard: If reversal sweep + re-entry isn't completed within maxWatchCandles (default 6 candles / 30 mins), signal expires.
 */

class ReversalSignalFilter {
    constructor() {
        this.activeWatch = null;
        this.enabled = true; // Can be toggled via config
        this.maxWatchCandles = 6; // Default 6 candles (30 minutes in 5-min timeframe)
        this.maxDriftPoints = 40; // Default 40 points runaway drift limit
        this.watchHistory = [];
    }

    /**
     * Evaluate incoming consensus signal & current candle tick
     * @param {Object} consensusResult Raw signal from consensusEngine ({ consensus: "BUY"|"SELL"|"NO_SIGNAL", entry: 22500, ... })
     * @param {Object} lastCandle Latest completed 5-min candle ({ close, high, low, open, date, time })
     * @returns {Object|null} Confirmed signal to pass to Real Trade Engine, or null if watching/filtering
     */
    evaluateSignal(consensusResult, lastCandle) {
        if (!this.enabled) {
            // Bypass mode: Pass consensus signal directly if reversal filter is disabled
            if (consensusResult && (consensusResult.consensus === "BUY" || consensusResult.consensus === "SELL")) {
                return consensusResult;
            }
            return null;
        }

        const candleClose = Number(lastCandle?.close || lastCandle?.price || consensusResult?.entry || 0);
        const candleLow = Number(lastCandle?.low || candleClose);
        const candleHigh = Number(lastCandle?.high || candleClose);

        // 1. IF NEW SIGNAL ARRIVES FROM CONSENSUS ENGINE:
        if (consensusResult && (consensusResult.consensus === "BUY" || consensusResult.consensus === "SELL")) {
            const newType = consensusResult.consensus;
            const newEntry = Number(consensusResult.entry || candleClose);

            // Check if this is a new signal or updating existing watch
            if (!this.activeWatch || this.activeWatch.entryPrice !== newEntry || this.activeWatch.type !== newType) {
                this.activeWatch = {
                    watchId: "REV_WATCH_" + Date.now(),
                    type: newType,
                    entryPrice: newEntry,
                    signalTime: consensusResult.time || lastCandle?.time || new Date().toLocaleTimeString("en-IN"),
                    signalDate: consensusResult.date || lastCandle?.date || new Date().toLocaleDateString("en-CA"),
                    stage: "STAGE_1_WATCH_REVERSAL", // STAGE_1_WATCH_REVERSAL -> STAGE_2_SWEEP_DETECTED -> CONFIRMED
                    sweepDetected: false,
                    sweepPrice: null,
                    candlesWatched: 0,
                    originalSignal: { ...consensusResult },
                    status: "ACTIVE_WATCH"
                };

                console.log(`\n👁️ [REVERSAL WATCH STARTED] ${newType} Consensus Signal received @ Entry ₹${newEntry}`);
                console.log(`⏳ Stage 1: Watching for ${newType === "BUY" ? "dip/sweep below" : "rally/sweep above"} ₹${newEntry}...`);
            }
        }

        // 2. IF NO ACTIVE WATCH EXISTS, RETURN NULL
        if (!this.activeWatch || this.activeWatch.status !== "ACTIVE_WATCH") {
            return null;
        }

        const watch = this.activeWatch;
        watch.candlesWatched += 1;

        console.log(`🔍 [REVERSAL TICK] Watch ID: ${watch.watchId} | Type: ${watch.type} | Stage: ${watch.stage} | Candle Close: ₹${candleClose} (High: ₹${candleHigh}, Low: ₹${candleLow}) | Watch Count: ${watch.candlesWatched}/${this.maxWatchCandles}`);

        // Skip signal candle itself (Candle 1): Reversal sweep evaluation begins on NEXT candle (Candle 2+)
        if (watch.candlesWatched === 1) {
            console.log(`⏳ [SIGNAL CANDLE SKIPPED] Watch initialized on signal candle. Reversal sweep evaluation will begin on next candle (Candle 2+)...`);
            return null;
        }

        // 2.5 RUNAWAY DRIFT GUARD (40 Points Max Drift Check)
        // If price has already moved 40+ points away from entry, ignore & cancel watch to prevent chasing runaway market
        const maxDrift = this.maxDriftPoints || 40;
        if (watch.type === "BUY" && candleClose > (watch.entryPrice + maxDrift)) {
            const driftPts = Number((candleClose - watch.entryPrice).toFixed(2));
            console.warn(`⚠️ [RUNAWAY DRIFT GUARD] BUY Signal entry ₹${watch.entryPrice} already moved +${driftPts} pts to ₹${candleClose} (> ${maxDrift} pts max limit). Ignoring & cancelling signal.`);
            watch.status = "EXPIRED_RUNAWAY_DRIFT";
            this.watchHistory.push({ ...watch });
            this.activeWatch = null;
            return null;
        }

        if (watch.type === "SELL" && candleClose < (watch.entryPrice - maxDrift)) {
            const driftPts = Number((watch.entryPrice - candleClose).toFixed(2));
            console.warn(`⚠️ [RUNAWAY DRIFT GUARD] SELL Signal entry ₹${watch.entryPrice} already moved -${driftPts} pts to ₹${candleClose} (> ${maxDrift} pts max limit). Ignoring & cancelling signal.`);
            watch.status = "EXPIRED_RUNAWAY_DRIFT";
            this.watchHistory.push({ ...watch });
            this.activeWatch = null;
            return null;
        }

        // =========================================================================
        // BUY SIGNAL REVERSAL LOGIC
        // =========================================================================
        if (watch.type === "BUY") {
            // STAGE 1: Check if price reversed / dipped BELOW entry price (Liquidity Sweep)
            if (watch.stage === "STAGE_1_WATCH_REVERSAL") {
                if (candleLow < watch.entryPrice || candleClose < watch.entryPrice) {
                    watch.stage = "STAGE_2_SWEEP_DETECTED";
                    watch.sweepDetected = true;
                    watch.sweepPrice = Math.min(candleLow, candleClose);
                    console.log(`🎯 [REVERSAL DIP DETECTED] BUY Liquidity Sweep found! Low: ₹${watch.sweepPrice} < Entry ₹${watch.entryPrice}`);
                    console.log(`⏳ Stage 2: Waiting for candle to CLOSE AT or ABOVE ₹${watch.entryPrice} to confirm re-entry...`);
                }
            }

            // STAGE 2: Check if candle closed back AT or ABOVE entry price (Re-entry Retest Confirmation)
            if (watch.stage === "STAGE_2_SWEEP_DETECTED") {
                if (candleClose >= watch.entryPrice) {
                    console.log(`✅ [REVERSAL CONFIRMED] BUY Liquidity Sweep & Retest COMPLETE! Candle Close ₹${candleClose} >= Entry ₹${watch.entryPrice}`);
                    
                    const confirmedSignal = {
                        ...watch.originalSignal,
                        consensus: "BUY",
                        isReversalConfirmed: true,
                        reversalSweepPrice: watch.sweepPrice,
                        reversalEntryPrice: candleClose,
                        reversalWatchCandles: watch.candlesWatched,
                        strategyName: `${watch.originalSignal.strategyName || 'Strategy'} + ReversalSweep`
                    };

                    watch.status = "CONFIRMED";
                    this.watchHistory.push({ ...watch });
                    this.activeWatch = null;

                    return confirmedSignal;
                }
            }
        }

        // =========================================================================
        // SELL SIGNAL REVERSAL LOGIC
        // =========================================================================
        if (watch.type === "SELL") {
            // STAGE 1: Check if price reversed / rallied ABOVE entry price (Liquidity Sweep)
            if (watch.stage === "STAGE_1_WATCH_REVERSAL") {
                if (candleHigh > watch.entryPrice || candleClose > watch.entryPrice) {
                    watch.stage = "STAGE_2_SWEEP_DETECTED";
                    watch.sweepDetected = true;
                    watch.sweepPrice = Math.max(candleHigh, candleClose);
                    console.log(`🎯 [REVERSAL RALLY DETECTED] SELL Liquidity Sweep found! High: ₹${watch.sweepPrice} > Entry ₹${watch.entryPrice}`);
                    console.log(`⏳ Stage 2: Waiting for candle to CLOSE AT or BELOW ₹${watch.entryPrice} to confirm re-entry...`);
                }
            }

            // STAGE 2: Check if candle closed back AT or BELOW entry price (Re-entry Retest Confirmation)
            if (watch.stage === "STAGE_2_SWEEP_DETECTED") {
                if (candleClose <= watch.entryPrice) {
                    console.log(`✅ [REVERSAL CONFIRMED] SELL Liquidity Sweep & Retest COMPLETE! Candle Close ₹${candleClose} <= Entry ₹${watch.entryPrice}`);
                    
                    const confirmedSignal = {
                        ...watch.originalSignal,
                        consensus: "SELL",
                        isReversalConfirmed: true,
                        reversalSweepPrice: watch.sweepPrice,
                        reversalEntryPrice: candleClose,
                        reversalWatchCandles: watch.candlesWatched,
                        strategyName: `${watch.originalSignal.strategyName || 'Strategy'} + ReversalSweep`
                    };

                    watch.status = "CONFIRMED";
                    this.watchHistory.push({ ...watch });
                    this.activeWatch = null;

                    return confirmedSignal;
                }
            }
        }

        // 3. CHECK TIMEOUT / EXPIRY GUARD
        if (watch.candlesWatched >= this.maxWatchCandles) {
            console.warn(`⏰ [REVERSAL WATCH EXPIRED] Watch ID ${watch.watchId} expired after ${watch.candlesWatched} candles without complete reversal retest.`);
            watch.status = "EXPIRED";
            this.watchHistory.push({ ...watch });
            this.activeWatch = null;
        }

        return null; // Return null while signal is still in watching / filtering phase
    }

    /**
     * Get Current Filter Status for UI Dashboard
     */
    getStatus() {
        return {
            enabled: this.enabled,
            activeWatch: this.activeWatch,
            totalHistory: this.watchHistory.length,
            recentWatches: this.watchHistory.slice(-5)
        };
    }
}

module.exports = new ReversalSignalFilter();
