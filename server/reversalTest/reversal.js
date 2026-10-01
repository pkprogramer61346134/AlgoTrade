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

const logger = require('./logger');

class ReversalSignalFilter {
    constructor() {
        this.activeWatch = null;
        this.enabled = true; // Can be toggled via config
        this.maxWatchCandles = 6; // Default 6 candles (30 minutes in 5-min timeframe)
        this.maxDriftPoints = 40; // Default 40 points runaway drift limit
        this.watchHistory = [];
        this.lastFilterEvent = "System Listening for Consensus Signals";
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

        // 1. CHECK IF AN ACTIVE WATCH IS CURRENTLY LOCKED
        if (this.activeWatch && this.activeWatch.status === "ACTIVE_WATCH") {
            // If a new signal arrives while a watch is active, LOCK & BLOCK the new signal!
            if (consensusResult && (consensusResult.consensus === "BUY" || consensusResult.consensus === "SELL")) {
                const incomingType = consensusResult.consensus;
                const incomingEntry = Number(consensusResult.entry || candleClose);

                if (incomingEntry !== this.activeWatch.entryPrice || incomingType !== this.activeWatch.type) {
                    console.log(`🔒 [ACTIVE WATCH LOCKED] Reversal Filter is currently watching ${this.activeWatch.type} @ ₹${this.activeWatch.entryPrice} (Watch ID: ${this.activeWatch.watchId}, Candle ${this.activeWatch.candlesWatched}/${this.maxWatchCandles}). Incoming ${incomingType} @ ₹${incomingEntry} signal BLOCKED & IGNORED until active watch completes.`);
                    this.lastFilterEvent = `🔒 Active Watch Locked (${this.activeWatch.type} @ ₹${this.activeWatch.entryPrice}). Incoming ${incomingType} signal blocked.`;
                    logger.logInfo("ACTIVE_WATCH_LOCKED", `Blocked incoming ${incomingType} signal @ ₹${incomingEntry} while watching ${this.activeWatch.type} @ ₹${this.activeWatch.entryPrice}`, { activeWatch: this.activeWatch });
                }
            }
        } else {
            // 2. NO ACTIVE WATCH EXISTS: START NEW WATCH IF SIGNAL ARRIVES
            if (consensusResult && (consensusResult.consensus === "BUY" || consensusResult.consensus === "SELL")) {
                const newType = consensusResult.consensus;
                const newEntry = Number(consensusResult.entry || candleClose);

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

                this.lastFilterEvent = `🔒 ACTIVE WATCH LOCKED: ${newType} @ ₹${newEntry} (Waiting for ${newType === "BUY" ? "Dip Below" : "Rally Above"} Entry)`;
                console.log(`\n👁️ [REVERSAL WATCH STARTED & LOCKED] ${newType} Consensus Signal received @ Entry ₹${newEntry}`);
                console.log(`⏳ Stage 1: Watching for ${newType === "BUY" ? "dip/sweep below" : "rally/sweep above"} ₹${newEntry}... (New signals locked out)`);
                logger.logInfo("WATCH_STARTED", `Started watching ${newType} consensus signal @ Entry ₹${newEntry}`, { watchId: this.activeWatch.watchId, signal: consensusResult });
            }
        }

        // 3. IF NO ACTIVE WATCH EXISTS, RETURN NULL
        if (!this.activeWatch || this.activeWatch.status !== "ACTIVE_WATCH") {
            return null;
        }

        const watch = this.activeWatch;
        watch.candlesWatched += 1;
        watch.livePrice = candleClose;
        if (!watch.liveLow || candleLow < watch.liveLow) watch.liveLow = candleLow;
        if (!watch.liveHigh || candleHigh > watch.liveHigh) watch.liveHigh = candleHigh;
        watch.driftDistancePoints = watch.type === "BUY" 
            ? Number((candleClose - watch.entryPrice).toFixed(2))
            : Number((watch.entryPrice - candleClose).toFixed(2));

        console.log(`🔍 [REVERSAL TICK] Watch ID: ${watch.watchId} | Type: ${watch.type} | Stage: ${watch.stage} | Candle Close: ₹${candleClose} (High: ₹${candleHigh}, Low: ₹${candleLow}) | Watch Count: ${watch.candlesWatched}/${this.maxWatchCandles}`);

        // Skip signal candle itself (Candle 1): Reversal sweep evaluation begins on NEXT candle (Candle 2+)
        if (watch.candlesWatched === 1) {
            console.log(`⏳ [SIGNAL CANDLE SKIPPED] Watch initialized on signal candle (Candle 1). Reversal sweep evaluation will begin on next candle (Candle 2+)...`);
            this.lastFilterEvent = `🔒 ACTIVE WATCH LOCKED: Candle 1/6 Skipped (Sweep evaluation starts on Candle 2+)`;
            return null;
        }

        // 3.5 RUNAWAY DRIFT GUARD (40 Points Max Drift Check)
        // If price has already moved 40+ points away from entry, ignore & cancel watch to prevent chasing runaway market
        const maxDrift = this.maxDriftPoints || 40;
        if (watch.type === "BUY" && candleClose > (watch.entryPrice + maxDrift)) {
            const driftPts = Number((candleClose - watch.entryPrice).toFixed(2));
            console.warn(`⚠️ [RUNAWAY DRIFT GUARD] BUY Signal entry ₹${watch.entryPrice} already moved +${driftPts} pts to ₹${candleClose} (> ${maxDrift} pts max limit). Ignoring & cancelling signal.`);
            watch.status = "EXPIRED_RUNAWAY_DRIFT";
            this.lastFilterEvent = `⚠️ Watch Cancelled: Runaway Drift (+${driftPts} pts > ${maxDrift} limit)`;
            logger.logInfo("RUNAWAY_DRIFT_EXPIRED", `BUY signal watch cancelled due to +${driftPts} pts drift > ${maxDrift} limit`, { watch });
            this.watchHistory.push({ ...watch });
            this.activeWatch = null;
            return null;
        }

        if (watch.type === "SELL" && candleClose < (watch.entryPrice - maxDrift)) {
            const driftPts = Number((watch.entryPrice - candleClose).toFixed(2));
            console.warn(`⚠️ [RUNAWAY DRIFT GUARD] SELL Signal entry ₹${watch.entryPrice} already moved -${driftPts} pts to ₹${candleClose} (> ${maxDrift} pts max limit). Ignoring & cancelling signal.`);
            watch.status = "EXPIRED_RUNAWAY_DRIFT";
            this.lastFilterEvent = `⚠️ Watch Cancelled: Runaway Drift (-${driftPts} pts > ${maxDrift} limit)`;
            logger.logInfo("RUNAWAY_DRIFT_EXPIRED", `SELL signal watch cancelled due to -${driftPts} pts drift > ${maxDrift} limit`, { watch });
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
                    this.lastFilterEvent = `🎯 STAGE 2: BUY Sweep Detected @ ₹${watch.sweepPrice}! Waiting for Retest Close >= ₹${watch.entryPrice}`;
                    console.log(`🎯 [REVERSAL DIP DETECTED] BUY Liquidity Sweep found! Low: ₹${watch.sweepPrice} < Entry ₹${watch.entryPrice}`);
                    console.log(`⏳ Stage 2: Waiting for candle to CLOSE AT or ABOVE ₹${watch.entryPrice} to confirm re-entry...`);
                    logger.logInfo("BUY_SWEEP_DETECTED", `BUY Liquidity Sweep detected @ ₹${watch.sweepPrice} < Entry ₹${watch.entryPrice}`, { watch });
                } else {
                    this.lastFilterEvent = `🔒 STAGE 1: Watching BUY Dip Below ₹${watch.entryPrice} (Candle ${watch.candlesWatched}/${this.maxWatchCandles})`;
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
                    this.lastFilterEvent = `✅ BUY Signal CONFIRMED & APPROVED @ Re-entry ₹${candleClose} (Sweep: ₹${watch.sweepPrice})`;
                    logger.logInfo("BUY_SIGNAL_CONFIRMED", `BUY signal confirmed & approved @ Re-entry ₹${candleClose} (Sweep: ₹${watch.sweepPrice})`, { confirmedSignal, watch });
                    this.watchHistory.push({ ...watch });
                    this.activeWatch = null;

                    return confirmedSignal;
                } else {
                    this.lastFilterEvent = `🎯 STAGE 2: Sweep Found @ ₹${watch.sweepPrice}. Waiting Close >= ₹${watch.entryPrice} (Candle ${watch.candlesWatched}/${this.maxWatchCandles})`;
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
                    this.lastFilterEvent = `🎯 STAGE 2: SELL Sweep Detected @ ₹${watch.sweepPrice}! Waiting for Retest Close <= ₹${watch.entryPrice}`;
                    console.log(`🎯 [REVERSAL RALLY DETECTED] SELL Liquidity Sweep found! High: ₹${watch.sweepPrice} > Entry ₹${watch.entryPrice}`);
                    console.log(`⏳ Stage 2: Waiting for candle to CLOSE AT or BELOW ₹${watch.entryPrice} to confirm re-entry...`);
                    logger.logInfo("SELL_SWEEP_DETECTED", `SELL Liquidity Sweep detected @ ₹${watch.sweepPrice} > Entry ₹${watch.entryPrice}`, { watch });
                } else {
                    this.lastFilterEvent = `🔒 STAGE 1: Watching SELL Rally Above ₹${watch.entryPrice} (Candle ${watch.candlesWatched}/${this.maxWatchCandles})`;
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
                    this.lastFilterEvent = `✅ SELL Signal CONFIRMED & APPROVED @ Re-entry ₹${candleClose} (Sweep: ₹${watch.sweepPrice})`;
                    logger.logInfo("SELL_SIGNAL_CONFIRMED", `SELL signal confirmed & approved @ Re-entry ₹${candleClose} (Sweep: ₹${watch.sweepPrice})`, { confirmedSignal, watch });
                    this.watchHistory.push({ ...watch });
                    this.activeWatch = null;

                    return confirmedSignal;
                } else {
                    this.lastFilterEvent = `🎯 STAGE 2: Sweep Found @ ₹${watch.sweepPrice}. Waiting Close <= ₹${watch.entryPrice} (Candle ${watch.candlesWatched}/${this.maxWatchCandles})`;
                }
            }
        }

        // 4. CHECK TIMEOUT / EXPIRY GUARD
        if (watch.candlesWatched >= this.maxWatchCandles) {
            console.warn(`⏰ [REVERSAL WATCH EXPIRED] Watch ID ${watch.watchId} expired after ${watch.candlesWatched} candles without complete reversal retest.`);
            watch.status = "EXPIRED";
            this.lastFilterEvent = `⏰ Watch EXPIRED: ${watch.type} @ ₹${watch.entryPrice} (6 Candles / 30m Limit Reached without Retest)`;
            logger.logInfo("WATCH_EXPIRED_TIMEOUT", `Watch ID ${watch.watchId} expired after ${watch.candlesWatched} candles without complete retest`, { watch });
            this.watchHistory.push({ ...watch });
            this.activeWatch = null;
        }

        return null; // Return null while signal is still in watching / filtering phase
    }

    /**
     * Live Tick Tracker: Receives live market ticks every second during active watch
     * @param {number|string} livePrice Live Nifty Spot Price
     */
    updateLiveTick(livePrice) {
        if (!this.activeWatch || this.activeWatch.status !== "ACTIVE_WATCH") return;
        const p = Number(livePrice);
        if (!p || isNaN(p) || p <= 0) return;

        const watch = this.activeWatch;
        watch.livePrice = p;
        if (!watch.liveLow || p < watch.liveLow) watch.liveLow = p;
        if (!watch.liveHigh || p > watch.liveHigh) watch.liveHigh = p;

        if (watch.type === "BUY") {
            watch.driftDistancePoints = Number((p - watch.entryPrice).toFixed(2));
            if (p < watch.entryPrice && watch.candlesWatched >= 2) {
                if (watch.stage === "STAGE_1_WATCH_REVERSAL") {
                    watch.stage = "STAGE_2_SWEEP_DETECTED";
                    watch.sweepDetected = true;
                    console.log(`🎯 [LIVE DIP DETECTED] BUY Liquidity Sweep found live @ ₹${p} < Entry ₹${watch.entryPrice}`);
                }
                watch.sweepPrice = watch.sweepPrice ? Math.min(p, watch.sweepPrice) : p;
                this.lastFilterEvent = `🎯 LIVE STAGE 2: BUY Sweep Detected @ ₹${watch.sweepPrice}! Waiting for Candle Retest Close >= ₹${watch.entryPrice}`;
            }
        } else if (watch.type === "SELL") {
            watch.driftDistancePoints = Number((watch.entryPrice - p).toFixed(2));
            if (p > watch.entryPrice && watch.candlesWatched >= 2) {
                if (watch.stage === "STAGE_1_WATCH_REVERSAL") {
                    watch.stage = "STAGE_2_SWEEP_DETECTED";
                    watch.sweepDetected = true;
                    console.log(`🎯 [LIVE RALLY DETECTED] SELL Liquidity Sweep found live @ ₹${p} > Entry ₹${watch.entryPrice}`);
                }
                watch.sweepPrice = watch.sweepPrice ? Math.max(p, watch.sweepPrice) : p;
                this.lastFilterEvent = `🎯 LIVE STAGE 2: SELL Sweep Detected @ ₹${watch.sweepPrice}! Waiting for Candle Retest Close <= ₹${watch.entryPrice}`;
            }
        }
    }

    /**
     * Get Current Filter Status for UI Dashboard
     */
    getStatus() {
        return {
            enabled: this.enabled,
            activeWatch: this.activeWatch,
            isLocked: !!(this.activeWatch && this.activeWatch.status === "ACTIVE_WATCH"),
            maxWatchCandles: this.maxWatchCandles,
            maxDriftPoints: this.maxDriftPoints,
            lastFilterEvent: this.lastFilterEvent || (this.activeWatch ? `Locked: Watching ${this.activeWatch.type} @ ₹${this.activeWatch.entryPrice}` : "System Listening for Consensus Signals"),
            totalHistory: this.watchHistory.length,
        };
    }
}

module.exports = new ReversalSignalFilter();
