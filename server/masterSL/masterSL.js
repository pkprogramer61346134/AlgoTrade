/**
 * Master Central Trailing Stop Loss & Risk Engine (MasterSL)
 * Location: C:\AlgoTrade\server\masterSL\masterSL.js
 * 
 * Features:
 * 1. Single Master Architecture: Controls Backtesting, Paper Trading, and Real Broker Trading.
 * 2. Adapter Handlers Pattern: Environment modules pass checkBalance, selectStrike, placeOrder, modifyOrder, closeOrder.
 * 3. Robust Fail-Safe Auto-Retry: Every step retries up to 5 times (configurable) on errors.
 * 4. Dedicated Error Logging: All errors, stack traces, and retry attempts written to master_sl_error.log.
 * 5. Capped Max Loss per Trade (e.g. ₹300) with dynamic Risk-Points calculation.
 * 6. Dynamic 4-Stage Trailing SL with Breathing Room buffer (e.g. 0.50 points).
 */

const masterConfig = require('./config');
const logger = require('./logger');

const SERVER_STARTUP_TIME_MS = Date.now();

class MasterTrailingEngine {
    constructor() {
        this.activePosition = null;
        this.tradeHistory = [];
        this.isOrderInFlight = false;
        this.lastExitTimestamp = 0;
    }

    /**
     * Helper: Execute an async step with up to 5 automatic retries and logger tracking
     * 
     * @param {Function} fn - Async step function to execute
     * @param {string} stepName - Human-readable step name
     * @param {string} envName - Environment identifier ("PAPER", "REAL", "BACKTEST")
     * @param {number} [maxRetries=5] - Maximum retries
     * @param {number} [delayMs=1000] - Delay between retries in ms
     * @returns {Promise<any>} Output of fn or throws Error if exhausted
     */
    async retryStepAsync(fn, stepName, envName = "GENERAL", maxRetries = 5, delayMs = 1000) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await fn();
                if (result !== null && result !== undefined && result !== false) {
                    return result;
                }
                throw new Error(`${stepName} returned null or false.`);
            } catch (err) {
                lastError = err;
                if (attempt < maxRetries) {
                    logger.logRetry(envName, stepName, attempt, maxRetries, err.message, delayMs);
                    await new Promise(res => setTimeout(res, delayMs));
                }
            }
        }

        logger.logError(envName, stepName, lastError, { maxRetries, delayMs });
        throw new Error(`[${envName}] Step ${stepName} failed after ${maxRetries} retries: ${lastError ? lastError.message : 'Unknown error'}`);
    }

    /**
     * Check if a given time string (or current time) is within trading hours (09:40 to 15:10)
     */
    isWithinTradingHours(timeStr = null) {
        const cfg = masterConfig.getConfig();
        const startStr = cfg.tradingStartTime || "09:40:00";
        const endStr = cfg.tradingEndTime || "15:10:00";

        let timeToParse = timeStr;
        if (!timeToParse) {
            timeToParse = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
        }

        const parseMinutes = (tStr) => {
            if (!tStr) return 0;
            const parts = String(tStr).trim().split(":");
            if (parts.length < 2) return 0;
            const hrs = parseInt(parts[0], 10) || 0;
            const mins = parseInt(parts[1], 10) || 0;
            return (hrs * 60) + mins;
        };

        const currentMins = parseMinutes(timeToParse);
        const startMins = parseMinutes(startStr); // 9*60+40 = 580
        const endMins = parseMinutes(endStr);     // 15*60+10 = 910

        return currentMins >= startMins && currentMins < endMins;
    }

    /**
     * Check if current time is past trading end time (3:10 PM / 15:10) for Auto Square-Off
     */
    isAfterTradingHours(timeStr = null) {
        const cfg = masterConfig.getConfig();
        const endStr = cfg.autoSquareOffTime || cfg.tradingEndTime || "15:10:00";

        let timeToParse = timeStr;
        if (!timeToParse) {
            timeToParse = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
        }

        const parseMinutes = (tStr) => {
            if (!tStr) return 0;
            const parts = String(tStr).trim().split(":");
            if (parts.length < 2) return 0;
            const hrs = parseInt(parts[0], 10) || 0;
            const mins = parseInt(parts[1], 10) || 0;
            return (hrs * 60) + mins;
        };

        const currentMins = parseMinutes(timeToParse);
        const endMins = parseMinutes(endStr);

        return currentMins >= endMins;
    }

    /**
     * Process Trade Signal & Execute Order Flow via Environment Handlers
     * 
     * @param {Object} signal - Consensus Head signal { consensus: "BUY"|"SELL", entry: number, sl: number }
     * @param {Object} environmentHandlers - Environment specific interface handlers
     * @param {Function} environmentHandlers.checkBalance - () => Promise<number>
     * @param {Function} [environmentHandlers.selectStrike] - (spotPrice, optionType, maxBudget) => Promise<Object>
     * @param {Function} environmentHandlers.placeOrder - (orderDetails) => Promise<Object>
     * @param {Function} [environmentHandlers.modifyOrder] - (orderId, newSl) => Promise<boolean>
     * @param {Function} [environmentHandlers.closeOrder] - (position) => Promise<boolean>
     * @param {string} [envName="PAPER"] - Environment Name ("PAPER", "REAL", "BACKTEST")
     * @returns {Promise<Object|null>} Active Position or null if ignored/failed
     */
    async processSignal(signal, environmentHandlers, envName = "PAPER") {
        if (!signal || !environmentHandlers) return null;

        const cfg = masterConfig.getConfig();
        const maxRetries = cfg.maxRetriesPerStep || 5;
        const retryDelay = cfg.retryDelayMs || 1000;

        // 1. Guard Check: Single Open Position Guard & Atomic In-Flight Order Guard
        if ((this.activePosition && this.activePosition.status === "OPEN") || this.isOrderInFlight) {
            logger.logInfo(envName, "SIGNAL_IGNORED", `Position already open or order in flight (${this.activePosition?.symbol || 'ORDER_IN_FLIGHT'}). Ignoring signal.`);
            return { status: "IGNORED", reason: "POSITION_ALREADY_OPEN_OR_ORDER_IN_FLIGHT" };
        }

        // 2. Guard Check: Trading Hours Guard (Signals accepted from 09:40 AM to 03:10 PM only)
        const timeStr = signal.time || new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
        if (!this.isWithinTradingHours(timeStr)) {
            logger.logInfo(envName, "SIGNAL_IGNORED", `Signal outside trading hours (09:40 - 15:10). Signal time: ${timeStr}`);
            return { status: "IGNORED", reason: "OUTSIDE_TRADING_HOURS (09:40 - 15:10)" };
        }

        // 3. Guard Check: Startup Grace Period Guard (Signals ignored during initial 45s server startup)
        const elapsedStartupSecs = Math.round((Date.now() - SERVER_STARTUP_TIME_MS) / 1000);
        const startupGraceSecs = Number(cfg.startupGracePeriodSeconds || 45);
        if (elapsedStartupSecs < startupGraceSecs && envName !== "BACKTEST" && envName !== "TEST_SIM") {
            logger.logInfo(envName, "SIGNAL_IGNORED", `System in startup stabilization period (${elapsedStartupSecs}s / ${startupGraceSecs}s). Ignoring signal.`);
            return { status: "IGNORED", reason: `SYSTEM_STABILIZING (${startupGraceSecs - elapsedStartupSecs}s remaining)` };
        }

        // 4. Guard Check: Post-Exit Cooldown Guard (Prevents immediate re-entry right after trade exit)
        if (this.lastExitTimestamp > 0 && envName !== "BACKTEST") {
            const elapsedExitSecs = Math.round((Date.now() - this.lastExitTimestamp) / 1000);
            const cooldownSecs = Number(cfg.postExitCooldownSeconds || 90);
            if (elapsedExitSecs < cooldownSecs) {
                const remCooldownSecs = cooldownSecs - elapsedExitSecs;
                logger.logInfo(envName, "SIGNAL_IGNORED", `Post-exit cooldown active (${elapsedExitSecs}s / ${cooldownSecs}s). Ignoring signal.`);
                return { status: "IGNORED", reason: `POST_EXIT_COOLDOWN (${remCooldownSecs}s remaining)` };
            }
        }

        // Synchronously acquire atomic lock BEFORE any async operations
        this.isOrderInFlight = true;

        try {
            // 2. Guard Check: Max Trades Per Day Check
            const todayDate = signal.date || new Date().toLocaleDateString("en-CA");
            const todayTradesCount = this.tradeHistory.filter(t => (t.entryDate === todayDate)).length;
            if (todayTradesCount >= cfg.maxTradesPerDay) {
                logger.logInfo(envName, "SIGNAL_IGNORED", `Max trades per day reached (${cfg.maxTradesPerDay}). Ignoring signal.`);
                return { status: "IGNORED", reason: `MAX_DAILY_TRADES_REACHED (${cfg.maxTradesPerDay})` };
            }

            if (signal.consensus !== "BUY" && signal.consensus !== "SELL") return null;

            const optionType = signal.consensus === "BUY" ? "CE" : "PE";
            const entrySpotPrice = Number(signal.entry || 0);

            // STEP 1: Balance Check (With 5 Retries)
            const availableBalance = await this.retryStepAsync(
                async () => {
                    if (typeof environmentHandlers.checkBalance === 'function') {
                        return await environmentHandlers.checkBalance();
                    }
                    throw new Error("[MASTER SL ERROR] Check balance handler is missing or not configured for environment.");
                },
                "CHECK_BALANCE",
                envName,
                maxRetries,
                retryDelay
            );

            const maxBudget = availableBalance * ((cfg.maxBudgetPercent || 100) / 100);

            // STEP 2: Strike Price Selection (Optional / If provided by handler)
            let selectedStrikeInfo = null;
            if (typeof environmentHandlers.selectStrike === 'function') {
                selectedStrikeInfo = await this.retryStepAsync(
                    () => environmentHandlers.selectStrike(entrySpotPrice, optionType, maxBudget),
                    "SELECT_STRIKE",
                    envName,
                    maxRetries,
                    retryDelay
                );
            }

            const isOptionTrade = Boolean(selectedStrikeInfo && selectedStrikeInfo.securityId && String(selectedStrikeInfo.securityId) !== "13") || Boolean(signal.isOption && String(signal.securityId) !== "13");
            const symbol = selectedStrikeInfo?.symbol || `NIFTY_${optionType}`;
            const entryPrice = Number(selectedStrikeInfo?.liveLtp || selectedStrikeInfo?.ltp || selectedStrikeInfo?.price || entrySpotPrice);
            const lotSize = Math.max(1, Number(selectedStrikeInfo?.lotSize || 65));
            const totalQty = Number(selectedStrikeInfo?.totalQty || selectedStrikeInfo?.qty || lotSize);

            // STEP 3: Risk & Targets Calculation (Option Price Action SL or Max Loss Capping)
            let initialSl;
            let riskPoints;

            if (selectedStrikeInfo?.optionSL && Number(selectedStrikeInfo.optionSL) > 0) {
                initialSl = Number(selectedStrikeInfo.optionSL);
                riskPoints = Math.max(0.1, Number(Math.abs(entryPrice - initialSl).toFixed(2)));
            } else if (cfg.maxLossPerTrade && Number(cfg.maxLossPerTrade) > 0) {
                const maxLossRupees = Number(cfg.maxLossPerTrade);
                riskPoints = Number((maxLossRupees / lotSize).toFixed(2));
                initialSl = isOptionTrade ? Number((entryPrice - riskPoints).toFixed(2)) : (optionType === "CE" ? Number((entryPrice - riskPoints).toFixed(2)) : Number((entryPrice + riskPoints).toFixed(2)));
            } else {
                initialSl = Number(signal.sl || (isOptionTrade ? entryPrice - 25 : (optionType === "CE" ? entryPrice - 25 : entryPrice + 25)));
                riskPoints = Math.abs(entryPrice - initialSl);
            }

            if (isNaN(initialSl) || initialSl <= 0) {
                initialSl = isOptionTrade ? Number((entryPrice - 25).toFixed(2)) : (optionType === "CE" ? Number((entryPrice - 25).toFixed(2)) : Number((entryPrice + 25).toFixed(2)));
                riskPoints = Math.abs(entryPrice - initialSl);
            }

            // Dynamic Targets: TR1 (1:1), TR2 (1:2), TR3 (1:3), TR4 (1:4), TR5 (1:5)
            let tr1, tr2, tr3, tr4, tr5;

            if (isOptionTrade || optionType === "CE") {
                // Option Buying (CE or PE option contracts): Price increases to reach Targets
                tr1 = Number((entryPrice + riskPoints).toFixed(2));
                tr2 = Number((entryPrice + (riskPoints * 2)).toFixed(2));
                tr3 = Number((entryPrice + (riskPoints * 3)).toFixed(2));
                tr4 = Number((entryPrice + (riskPoints * 4)).toFixed(2));
                tr5 = Number((entryPrice + (riskPoints * 5)).toFixed(2));
            } else {
                // Spot Shorting (PE Spot Index): Price decreases to reach Targets
                tr1 = Number((entryPrice - riskPoints).toFixed(2));
                tr2 = Number((entryPrice - (riskPoints * 2)).toFixed(2));
                tr3 = Number((entryPrice - (riskPoints * 3)).toFixed(2));
                tr4 = Number((entryPrice - (riskPoints * 4)).toFixed(2));
                tr5 = Number((entryPrice - (riskPoints * 5)).toFixed(2));
            }

            // Target Mode determination ("1:1", "1:2", "1:3", "1:4", "1:5", "TRAILING")
            const mode = String(cfg.targetMode || "TRAILING").toUpperCase();
            let targetPrice = tr5;
            let targetLabel = "TR5 (1:5)";

            if (mode.includes("1:1")) { targetPrice = tr1; targetLabel = "TR1 (1:1)"; }
            else if (mode.includes("1:2")) { targetPrice = tr2; targetLabel = "TR2 (1:2)"; }
            else if (mode.includes("1:3")) { targetPrice = tr3; targetLabel = "TR3 (1:3)"; }
            else if (mode.includes("1:4")) { targetPrice = tr4; targetLabel = "TR4 (1:4)"; }
            else if (mode.includes("1:5")) { targetPrice = tr5; targetLabel = "TR5 (1:5)"; }

            const orderPayload = {
                tradeId: "MASTER_SL_" + (this.tradeHistory.length + 1),
                symbol: symbol,
                optionType: optionType,
                isOptionTrade: isOptionTrade,
                entryDate: signal.date || new Date().toLocaleDateString("en-CA"),
                entryTime: signal.time || new Date().toLocaleTimeString("en-IN"),
                entryPrice: entryPrice,
                initialSl: initialSl,
                currentSl: initialSl,
                targetPrice: targetPrice,
                targetLabel: targetLabel,
                targetMode: mode,
                qty: totalQty,
                lotSize: lotSize,
                strikeInfo: selectedStrikeInfo,
                levels: { initialSl, tr1, tr2, tr3, tr4, tr5 },
                trailingStage: "INITIAL",
                status: "OPEN"
            };

            // STEP 4: Place Order via Handler (With 5 Retries)
            const placedOrderResult = await this.retryStepAsync(
                () => environmentHandlers.placeOrder(orderPayload),
                "PLACE_ORDER",
                envName,
                maxRetries,
                retryDelay
            );

            this.activePosition = {
                ...orderPayload,
                qty: Number(placedOrderResult?.quantity || orderPayload.qty),
                orderId: placedOrderResult?.orderId || orderPayload.tradeId,
                handlers: environmentHandlers,
                envName: envName
            };

            logger.logInfo(envName, "ORDER_EXECUTED", `Position Opened: ${symbol} | Entry: ₹${entryPrice} | Qty: ${this.activePosition.qty} | SL: ₹${initialSl} | Target (${targetLabel}): ₹${targetPrice}`);
            return { status: "EXECUTED", position: this.activePosition };

        } catch (err) {
            logger.logError(envName, "SIGNAL_EXECUTION_FAILED", err);
            this.activePosition = null;
            return null;
        } finally {
            this.isOrderInFlight = false;
        }
    }

    /**
     * Process Price/Candle Tick: Evaluates Trailing SL Rules & Exits
     * 
     * @param {Object} tick - Current tick { high, low, close, price, ltp, liveLtp }
     * @param {string} [envName="PAPER"] - Environment Name
     * @returns {Promise<Object|null>} Closed position if exited, otherwise active position
     */
    async processTick(tick, envName = "PAPER") {
        if (!this.activePosition || this.activePosition.status !== "OPEN" || !tick) return null;

        const pos = this.activePosition;
        const lvls = pos.levels;
        const cfg = masterConfig.getConfig();
        const buffer = cfg.breathingRoomPoints || 0.50; // Breathing room buffer

        const tickTimeStr = tick.time || tick.date || new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });

        const isLiveTick = tick.status === "live" || Boolean(tick.liveLtp) || pos.envName === "REAL_TRADE";
        const livePrice = Number(tick.liveLtp || tick.ltp || tick.price || tick.close);

        const currentHigh = isLiveTick ? livePrice : Number(tick.candleHigh || tick.high || livePrice);
        const currentLow = isLiveTick ? livePrice : Number(tick.candleLow || tick.low || livePrice);

        if (isNaN(currentHigh) || isNaN(currentLow)) return null;

        let exitTriggered = false;
        let exitPrice = 0;
        let exitReason = "";

        // 3:10 PM Auto Square-Off Guard
        if (this.isAfterTradingHours(tickTimeStr)) {
            exitTriggered = true;
            exitPrice = Number(tick.close || tick.price || tick.ltp || pos.entryPrice);
            exitReason = "AUTO_TIME_EXIT_3_10_PM";
        }

        const mode = String(pos.targetMode || cfg.targetMode || "TRAILING").toUpperCase();
        const isTrailingEnabled = !mode.includes("FIXED") && cfg.disableTrailing !== true && cfg.enableAutoTrailing !== false;
        const isOptionBuying = pos.isOptionTrade || pos.envName === "REAL_TRADE" || pos.optionType === "CE";

        if (!isTrailingEnabled) {
            // FIXED TARGET MODE (NO TRAILING SL)
            if (isOptionBuying) {
                if (currentHigh >= pos.targetPrice) {
                    exitTriggered = true; exitPrice = pos.targetPrice; exitReason = `TARGET_HIT (${pos.targetLabel})`;
                } else if (currentLow <= pos.initialSl) {
                    exitTriggered = true; exitPrice = pos.initialSl; exitReason = "INITIAL_SL_HIT";
                }
            } else {
                if (currentLow <= pos.targetPrice) {
                    exitTriggered = true; exitPrice = pos.targetPrice; exitReason = `TARGET_HIT (${pos.targetLabel})`;
                } else if (currentHigh >= pos.initialSl) {
                    exitTriggered = true; exitPrice = pos.initialSl; exitReason = "INITIAL_SL_HIT";
                }
            }
        } else {
            // DYNAMIC 1-R LAG TRAILING SL MODE (Full Breathing Room + Locked Profits)
            let newSl = pos.currentSl;
            let newStage = pos.trailingStage;

            if (isOptionBuying) {
                // Stage 0: When price hits TR1 (1:1), trail SL to Entry Price (Cost-to-Cost / Zero Risk!)
                if (currentHigh >= lvls.tr1 && cfg.autoTrailOnTR1 !== false) {
                    if (pos.entryPrice > newSl) { newSl = pos.entryPrice; newStage = "TRAILED_COST_TO_COST"; }
                }
                // Stage 1: When price hits TR2 (1:2), trail SL to TR1 (Locks 1:1 / ₹300 Profit with 1-R Breathing Room!)
                if (currentHigh >= lvls.tr2 && cfg.autoTrailOnTR2 !== false) {
                    if (lvls.tr1 > newSl) { newSl = lvls.tr1; newStage = "TRAILED_TR1 (LOCKED)"; }
                }
                // Stage 2: When price hits TR3 (1:3), trail SL to TR2 (Locks 1:2)
                if (currentHigh >= lvls.tr3 && cfg.autoTrailOnTR3 !== false) {
                    if (lvls.tr2 > newSl) { newSl = lvls.tr2; newStage = "TRAILED_TR2"; }
                }
                // Stage 3: When price hits TR4 (1:4), trail SL to TR3 (Locks 1:3)
                if (currentHigh >= lvls.tr4 && cfg.autoTrailOnTR4 !== false) {
                    if (lvls.tr3 > newSl) { newSl = lvls.tr3; newStage = "TRAILED_TR3"; }
                }
                // Stage 4: When price hits TR5 (1:5), trail SL to TR4 (Locks 1:4)
                if (currentHigh >= lvls.tr5 && cfg.autoTrailOnTR5 !== false) {
                    if (lvls.tr4 > newSl) { newSl = lvls.tr4; newStage = "TRAILED_TR4"; }
                }

                // Update SL immediately if trailed
                if (newSl !== pos.currentSl) {
                    pos.currentSl = newSl;
                    pos.trailingStage = newStage;

                    if (pos.handlers && typeof pos.handlers.modifyOrder === 'function') {
                        try {
                            this.retryStepAsync(
                                () => pos.handlers.modifyOrder(pos.orderId, newSl, newStage),
                                "MODIFY_ORDER_SL",
                                envName,
                                cfg.maxRetriesPerStep || 5,
                                cfg.retryDelayMs || 1000
                            ).catch(err => logger.logError(envName, "MODIFY_ORDER_FAILED", err));
                        } catch (err) {
                            logger.logError(envName, "MODIFY_ORDER_FAILED", err);
                        }
                    }
                    logger.logInfo(envName, "SL_TRAILED", `SL trailed to ₹${newSl} (${newStage})`);
                }

                // Exit conditions: Target Hit at targetPrice OR SL Hit
                if (currentHigh >= pos.targetPrice) {
                    exitTriggered = true; exitPrice = pos.targetPrice; exitReason = `TARGET_HIT (${pos.targetLabel})`;
                } else if (currentLow <= pos.currentSl) {
                    exitTriggered = true; exitPrice = pos.currentSl;
                    exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                }

            } else {
                // Spot Index Shorting (PE Spot Index):
                if (currentLow <= lvls.tr1 && cfg.autoTrailOnTR1 !== false) {
                    if (pos.entryPrice < newSl) { newSl = pos.entryPrice; newStage = "TRAILED_COST_TO_COST"; }
                }
                if (currentLow <= lvls.tr2 && cfg.autoTrailOnTR2 !== false) {
                    if (lvls.tr1 < newSl) { newSl = lvls.tr1; newStage = "TRAILED_TR1 (LOCKED)"; }
                }
                if (currentLow <= lvls.tr3 && cfg.autoTrailOnTR3 !== false) {
                    if (lvls.tr2 < newSl) { newSl = lvls.tr2; newStage = "TRAILED_TR2"; }
                }
                if (currentLow <= lvls.tr4 && cfg.autoTrailOnTR4 !== false) {
                    if (lvls.tr3 < newSl) { newSl = lvls.tr3; newStage = "TRAILED_TR3"; }
                }
                if (currentLow <= lvls.tr5 && cfg.autoTrailOnTR5 !== false) {
                    if (lvls.tr4 < newSl) { newSl = lvls.tr4; newStage = "TRAILED_TR4"; }
                }

                if (newSl !== pos.currentSl) {
                    pos.currentSl = newSl;
                    pos.trailingStage = newStage;

                    if (pos.handlers && typeof pos.handlers.modifyOrder === 'function') {
                        try {
                            this.retryStepAsync(
                                () => pos.handlers.modifyOrder(pos.orderId, newSl, newStage),
                                "MODIFY_ORDER_SL",
                                envName,
                                cfg.maxRetriesPerStep || 5,
                                cfg.retryDelayMs || 1000
                            ).catch(err => logger.logError(envName, "MODIFY_ORDER_FAILED", err));
                        } catch (err) {
                            logger.logError(envName, "MODIFY_ORDER_FAILED", err);
                        }
                    }
                    logger.logInfo(envName, "SL_TRAILED", `SL trailed to ₹${newSl} (${newStage})`);
                }

                if (currentLow <= pos.targetPrice) {
                    exitTriggered = true; exitPrice = pos.targetPrice; exitReason = `TARGET_HIT (${pos.targetLabel})`;
                } else if (currentHigh >= pos.currentSl) {
                    exitTriggered = true; exitPrice = pos.currentSl;
                    exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                }
            }
        }

        // On Trade Exit
        if (exitTriggered) {
            pos.status = "CLOSED";
            pos.exitPrice = exitPrice;
            pos.exitReason = exitReason;

            const isOptionTrade = Boolean(pos.isOptionTrade);
            const diff = isOptionTrade ? (exitPrice - pos.entryPrice) : (pos.optionType === "CE" ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice);
            pos.realizedPnl = Number((diff * pos.qty).toFixed(2));

            if (pos.handlers && typeof pos.handlers.closeOrder === 'function') {
                try {
                    await this.retryStepAsync(
                        () => pos.handlers.closeOrder(pos),
                        "CLOSE_ORDER",
                        envName,
                        cfg.maxRetriesPerStep || 5,
                        cfg.retryDelayMs || 1000
                    );
                } catch (err) {
                    logger.logError(envName, "CLOSE_ORDER_FAILED", err);
                }
            }

            this.tradeHistory.push({ ...pos });
            const closedPosition = { ...pos };
            this.activePosition = null;
            this.lastExitTimestamp = Date.now();

            logger.logInfo(envName, "POSITION_CLOSED", `Closed ${closedPosition.symbol} | Exit: ₹${exitPrice} | Reason: ${exitReason} | PnL: ₹${closedPosition.realizedPnl}`);
            return closedPosition;
        }

        return pos;
    }

    /**
     * Get Engine Status
     */
    getStatus() {
        // Ghost position auto-cleanup guard: If activePosition has invalid entryPrice, auto-reset it
        if (this.activePosition && (!this.activePosition.entryPrice || isNaN(this.activePosition.entryPrice) || Number(this.activePosition.entryPrice) <= 0)) {
            console.warn(`⚠️ [MASTER SL GUARD] Cleaning up invalid ghost position (${this.activePosition.symbol || 'UNKNOWN'}). Invalid entryPrice: ${this.activePosition.entryPrice}`);
            this.activePosition = null;
        }

        const cfg = masterConfig.getConfig();
        const cooldownSecs = Number(cfg.postExitCooldownSeconds || 90);
        const elapsedExitSecs = this.lastExitTimestamp > 0 ? Math.round((Date.now() - this.lastExitTimestamp) / 1000) : 9999;
        const isCooldownActive = elapsedExitSecs < cooldownSecs;

        return {
            activePosition: this.activePosition,
            history: this.tradeHistory,
            totalTrades: this.tradeHistory.length,
            totalPnl: Number(this.tradeHistory.reduce((acc, t) => acc + (t.realizedPnl || 0), 0).toFixed(2)),
            lastExitTimestamp: this.lastExitTimestamp,
            cooldownInfo: {
                cooldownSecs,
                elapsedExitSecs,
                remainingSecs: Math.max(0, cooldownSecs - elapsedExitSecs),
                isCooldownActive
            }
        };
    }
}

module.exports = new MasterTrailingEngine();
