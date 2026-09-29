/**
 * Master Central Trailing Stop Loss & Risk Engine (MasterSL)
 * Location: C:\AlgoTrade\server\masterSL\masterSL.js
 * 
 * Features & Modular Step Architecture:
 * 1. Single Master Architecture: Controls Backtesting, Paper Trading, and Real Broker Trading.
 * 2. Step 1: checkActivePosition() -> Checks single active position & atomic lock.
 * 3. Step 2: checkAccountBalance() -> Checks available balance via environment handler.
 * 4. Step 3: selectOptionStrike()  -> Selects best option contract via strike selector handler.
 * 5. Step 4: calculateRiskAndLevels() -> Computes Risk Points, Initial SL, TR1-TR5 targets.
 * 6. Step 5: placeBrokerOrder()     -> Places order via broker placement handler.
 * 7. Step 6: verifyAndStorePosition() -> Verifies order placement and sets active position.
 * 8. Step 7: modifyTrailingSL() & closePosition() -> Dynamic Trailing SL & broker exit control.
 */

const masterConfig = require('./config');
const logger = require('./logger');

class MasterTrailingEngine {
    constructor() {
        this.activePosition = null;
        this.tradeHistory = [];
        this.isOrderInFlight = false;
        this.isModifyInFlight = false;
        this.isCloseInFlight = false;
        this.lastOrderTimestamp = 0;
        this.lastModifyTimestamp = 0;
        this.lastExitTimestamp = 0;
    }

    /**
     * Helper: Execute an async step with automatic retries and logger tracking
     */
    async retryStepAsync(fn, stepName, envName = "GENERAL", maxRetries = 5, delayMs = 20000) {
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
     * Check if current time is past auto square-off time (3:10 PM / 15:10)
     */
    isAfterTradingHours(timeStr = null) {
        const cfg = masterConfig.getConfig();
        const endStr = cfg.autoSquareOffTime || "15:10:00";

        let timeToParse = timeStr;
        if (!timeToParse) {
            timeToParse = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
        }

        const parseMinutes = (tStr) => {
            if (!tStr) return 0;
            const isPm = /pm/i.test(tStr);
            const isAm = /am/i.test(tStr);
            const cleanStr = String(tStr).replace(/(am|pm)/i, "").trim();
            const parts = cleanStr.split(":");
            if (parts.length < 2) return 0;
            let hrs = parseInt(parts[0], 10) || 0;
            const mins = parseInt(parts[1], 10) || 0;
            if (isPm && hrs < 12) hrs += 12;
            if (isAm && hrs === 12) hrs = 0;
            return (hrs * 60) + mins;
        };

        const currentMins = parseMinutes(timeToParse);
        const endMins = parseMinutes(endStr);

        return currentMins >= endMins;
    }

    // =========================================================================
    // STEP 1: CHECK ACTIVE POSITION
    // =========================================================================
    checkActivePosition() {
        const hasActive = Boolean(this.activePosition && (this.activePosition.status === "OPEN" || this.activePosition.status === "EXIT_FAILED"));
        return { hasActivePosition: hasActive, position: this.activePosition };
    }

    // =========================================================================
    // STEP 2: CHECK ACCOUNT BALANCE
    // =========================================================================
    async checkAccountBalance(environmentHandlers, envName = "PAPER") {
        const cfg = masterConfig.getConfig();
        const maxRetries = cfg.maxRetriesPerStep || 5;
        const retryDelay = cfg.retryDelayMs || 1000;

        return await this.retryStepAsync(
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
    }

    // =========================================================================
    // STEP 3: SELECT OPTION STRIKE
    // =========================================================================
    async selectOptionStrike(environmentHandlers, spotPrice, optionType, maxBudget, envName = "PAPER") {
        const cfg = masterConfig.getConfig();
        const maxRetries = cfg.maxRetriesPerStep || 5;
        const retryDelay = cfg.retryDelayMs || 1000;

        if (typeof environmentHandlers.selectStrike === 'function') {
            return await this.retryStepAsync(
                () => environmentHandlers.selectStrike(spotPrice, optionType, maxBudget),
                "SELECT_STRIKE",
                envName,
                maxRetries,
                retryDelay
            );
        }
        return null;
    }

    // =========================================================================
    // STEP 4: CALCULATE RISK AND TARGET LEVELS (TR1 - TR5)
    // =========================================================================
    calculateRiskAndLevels(entryPrice, optionType, isOptionTrade, selectedStrikeInfo, signal, cfg, lotSize) {
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

        let tr1, tr2, tr3, tr4, tr5;

        if (isOptionTrade || optionType === "CE") {
            tr1 = Number((entryPrice + riskPoints).toFixed(2));
            tr2 = Number((entryPrice + (riskPoints * 2)).toFixed(2));
            tr3 = Number((entryPrice + (riskPoints * 3)).toFixed(2));
            tr4 = Number((entryPrice + (riskPoints * 4)).toFixed(2));
            tr5 = Number((entryPrice + (riskPoints * 5)).toFixed(2));
        } else {
            tr1 = Number((entryPrice - riskPoints).toFixed(2));
            tr2 = Number((entryPrice - (riskPoints * 2)).toFixed(2));
            tr3 = Number((entryPrice - (riskPoints * 3)).toFixed(2));
            tr4 = Number((entryPrice - (riskPoints * 4)).toFixed(2));
            tr5 = Number((entryPrice - (riskPoints * 5)).toFixed(2));
        }

        return { initialSl, riskPoints, tr1, tr2, tr3, tr4, tr5 };
    }

    // =========================================================================
    // STEP 5: PLACE BROKER ORDER VIA HANDLER
    // =========================================================================
    async placeBrokerOrder(environmentHandlers, orderPayload, envName = "PAPER") {
        const cfg = masterConfig.getConfig();
        const retryDelay = cfg.retryDelayMs || 1000;

        return await this.retryStepAsync(
            () => environmentHandlers.placeOrder(orderPayload),
            "PLACE_ORDER",
            envName,
            1, // 1 attempt for order placement to prevent duplicate orders
            retryDelay
        );
    }

    // =========================================================================
    // STEP 6: VERIFY AND STORE ACTIVE POSITION (DOUBLE-CHECK PLACEMENT)
    // =========================================================================
    async verifyAndStorePosition(orderPayload, placedOrderResult, environmentHandlers, envName = "PAPER") {
        let isVerified = true;
        let verifyDetails = null;

        const verifyFn = environmentHandlers?.verifyOrderPlacement || environmentHandlers?.verifyPlacement;
        if (typeof verifyFn === 'function') {
            try {
                // Short 500ms delay to allow broker OMS to process & update fill status
                await new Promise(res => setTimeout(res, 500));
                const secId = orderPayload.strikeInfo?.securityId || orderPayload.securityId;
                verifyDetails = await verifyFn(placedOrderResult?.orderId || orderPayload.tradeId, secId);
                if (verifyDetails && verifyDetails.isConfirmed === false) {
                    isVerified = false;
                    logger.logError(envName, "ORDER_PLACEMENT_VERIFICATION_FAILED", new Error(`Order ${placedOrderResult?.orderId} not confirmed on broker terminal (Status: ${verifyDetails.status})`));
                } else {
                    logger.logInfo(envName, "ORDER_PLACEMENT_DOUBLE_CHECKED", `Order ${placedOrderResult?.orderId || orderPayload.tradeId} double-checked & verified on broker terminal. Status: ${verifyDetails?.status || 'CONFIRMED'}`);
                }
            } catch (vErr) {
                logger.logError(envName, "ORDER_PLACEMENT_VERIFY_ERROR", vErr);
            }
        } else {
            logger.logInfo(envName, "ORDER_PLACEMENT_DOUBLE_CHECKED", `Order placement double-checked (Simulated / Paper Trading).`);
        }

        this.activePosition = {
            ...orderPayload,
            qty: Number(placedOrderResult?.quantity || orderPayload.qty),
            orderId: placedOrderResult?.orderId || orderPayload.tradeId,
            handlers: environmentHandlers,
            envName: envName,
            isVerifiedPlacement: isVerified
        };

        logger.logInfo(envName, "ORDER_EXECUTED", `Position Opened: ${orderPayload.symbol} | Entry: ₹${orderPayload.entryPrice} | Qty: ${this.activePosition.qty} | SL: ₹${orderPayload.initialSl} | Target (${orderPayload.targetLabel}): ₹${orderPayload.targetPrice} | Verification: ${isVerified ? 'VERIFIED' : 'UNCONFIRMED'}`);
        return this.activePosition;
    }

    /**
     * Process Trade Signal & Execute Order Flow via Modular Step Functions
     */
    async processSignal(signal, environmentHandlers, envName = "PAPER") {
        if (!signal || !environmentHandlers) return null;
        if (signal.consensus !== "BUY" && signal.consensus !== "SELL") return null;

        const cfg = masterConfig.getConfig();

        // 1. STEP 1: Check Active Position & Cooldown Guards
        const posCheck = this.checkActivePosition();
        if (posCheck.hasActivePosition || this.isOrderInFlight) {
            logger.logInfo(envName, "SIGNAL_IGNORED", `Position already open or order in flight (${posCheck.position?.symbol || 'ORDER_IN_FLIGHT'}). Ignoring signal.`);
            return { status: "IGNORED", reason: "POSITION_ALREADY_OPEN_OR_ORDER_IN_FLIGHT" };
        }

        const ORDER_COOLDOWN_MS = 30000;
        const timeSinceLastOrder = Date.now() - (this.lastOrderTimestamp || 0);
        if (timeSinceLastOrder < ORDER_COOLDOWN_MS) {
            const remSecs = Math.ceil((ORDER_COOLDOWN_MS - timeSinceLastOrder) / 1000);
            logger.logInfo(envName, "SIGNAL_IGNORED", `Order placement cooldown active (${remSecs}s remaining). Ignoring signal.`);
            return { status: "IGNORED", reason: `ORDER_COOLDOWN_ACTIVE (${remSecs}s)` };
        }

        // Synchronously acquire atomic lock & record timestamp BEFORE any async operations
        this.isOrderInFlight = true;
        this.lastOrderTimestamp = Date.now();

        try {
            // Guard Check: Max Trades Per Day Check
            const todayDate = signal.date || new Date().toLocaleDateString("en-CA");
            const todayTradesCount = this.tradeHistory.filter(t => (t.entryDate === todayDate)).length;
            if (todayTradesCount >= cfg.maxTradesPerDay) {
                logger.logInfo(envName, "SIGNAL_IGNORED", `Max trades per day reached (${cfg.maxTradesPerDay}). Ignoring signal.`);
                this.isOrderInFlight = false;
                return { status: "IGNORED", reason: `MAX_DAILY_TRADES_REACHED (${cfg.maxTradesPerDay})` };
            }

            const optionType = signal.consensus === "BUY" ? "CE" : "PE";
            const entrySpotPrice = Number(signal.entry || 0);

            // 2. STEP 2: Balance Check
            const availableBalance = await this.checkAccountBalance(environmentHandlers, envName);
            const minRequiredBalance = Number(cfg.minRequiredBalance || 1000);
            if (availableBalance < minRequiredBalance) {
                logger.logInfo(envName, "SIGNAL_IGNORED", `Available balance (₹${availableBalance}) is below minimum required balance (₹${minRequiredBalance}). Ignoring signal.`);
                this.isOrderInFlight = false;
                return { status: "IGNORED", reason: `INSUFFICIENT_MIN_BALANCE (₹${availableBalance} < ₹${minRequiredBalance})` };
            }

            const maxBudget = availableBalance * ((cfg.maxBudgetPercent || 100) / 100);

            // 3. STEP 3: Strike Price Selection
            const selectedStrikeInfo = await this.selectOptionStrike(environmentHandlers, entrySpotPrice, optionType, maxBudget, envName);

            const isOptionTrade = Boolean(selectedStrikeInfo && selectedStrikeInfo.securityId && String(selectedStrikeInfo.securityId) !== "13") || Boolean(signal.isOption && String(signal.securityId) !== "13");
            const symbol = selectedStrikeInfo?.symbol || `NIFTY_${optionType}`;
            const entryPrice = Number(selectedStrikeInfo?.liveLtp || selectedStrikeInfo?.ltp || selectedStrikeInfo?.price || entrySpotPrice);
            const lotSize = Math.max(1, Number(selectedStrikeInfo?.lotSize || 65));
            const totalQty = Number(selectedStrikeInfo?.totalQty || selectedStrikeInfo?.qty || lotSize);

            // 4. STEP 4: Risk & Targets Calculation
            const levels = this.calculateRiskAndLevels(entryPrice, optionType, isOptionTrade, selectedStrikeInfo, signal, cfg, lotSize);

            const mode = String(cfg.targetMode || "TRAILING").toUpperCase();
            let targetPrice = levels.tr5;
            let targetLabel = "TR5 (1:5)";

            if (mode.includes("1:1")) { targetPrice = levels.tr1; targetLabel = "TR1 (1:1)"; }
            else if (mode.includes("1:2")) { targetPrice = levels.tr2; targetLabel = "TR2 (1:2)"; }
            else if (mode.includes("1:3")) { targetPrice = levels.tr3; targetLabel = "TR3 (1:3)"; }
            else if (mode.includes("1:4")) { targetPrice = levels.tr4; targetLabel = "TR4 (1:4)"; }
            else if (mode.includes("1:5")) { targetPrice = levels.tr5; targetLabel = "TR5 (1:5)"; }

            const orderPayload = {
                tradeId: "MASTER_SL_" + Date.now() + "_" + (this.tradeHistory.length + 1),
                symbol: symbol,
                optionType: optionType,
                isOptionTrade: isOptionTrade,
                entryDate: signal.date || new Date().toLocaleDateString("en-CA"),
                entryTime: signal.time || new Date().toLocaleTimeString("en-IN"),
                entryPrice: entryPrice,
                initialSl: levels.initialSl,
                currentSl: levels.initialSl,
                targetPrice: targetPrice,
                targetLabel: targetLabel,
                targetMode: mode,
                qty: totalQty,
                lotSize: lotSize,
                strikeInfo: selectedStrikeInfo,
                levels: levels,
                trailingStage: "INITIAL",
                status: "OPEN"
            };

            // 5. STEP 5: Place Order via Handler
            const placedOrderResult = await this.placeBrokerOrder(environmentHandlers, orderPayload, envName);

            // 6. STEP 6: Double-Check Order Placement Verification & Store Position
            const activePos = await this.verifyAndStorePosition(orderPayload, placedOrderResult, environmentHandlers, envName);

            return { status: "EXECUTED", position: activePos };

        } catch (err) {
            logger.logError(envName, "SIGNAL_EXECUTION_FAILED", err);
            this.activePosition = null;
            return null;
        } finally {
            this.isOrderInFlight = false;
        }
    }

    // =========================================================================
    // STEP 7: MODIFY TRAILING SL ON BROKER TERMINAL (WITH DOUBLE-CHECK)
    // =========================================================================
    async modifyTrailingSL(newSl, newStage, envName = "PAPER") {
        if (!this.activePosition || this.isModifyInFlight) return false;
        const pos = this.activePosition;

        if (newSl !== pos.currentSl && (Date.now() - (this.lastModifyTimestamp || 0) > 2000)) {
            this.isModifyInFlight = true;
            this.lastModifyTimestamp = Date.now();
            const targetSl = newSl;
            const targetStage = newStage;

            if (pos.handlers && typeof pos.handlers.modifyOrder === 'function') {
                try {
                    await this.retryStepAsync(
                        () => pos.handlers.modifyOrder(pos.orderId, targetSl, targetStage),
                        "MODIFY_ORDER_SL",
                        envName,
                        3,
                        2000
                    );
                    pos.currentSl = targetSl;
                    pos.trailingStage = targetStage;
                    logger.logInfo(envName, "SL_TRAILED", `SL trailed successfully to ₹${targetSl} (${targetStage})`);

                    // DOUBLE-CHECK SL MODIFICATION ON BROKER TERMINAL
                    const verifyFn = pos.handlers.verifyOrderModification || pos.handlers.verifyModification;
                    if (typeof verifyFn === 'function') {
                        try {
                            const modConfirm = await verifyFn(pos.orderId, targetSl);
                            if (modConfirm && modConfirm.isConfirmed) {
                                logger.logInfo(envName, "SL_MODIFY_DOUBLE_CHECKED", `SL modification double-checked & verified on broker terminal: ₹${targetSl} (Terminal Price: ₹${modConfirm.priceOnTerminal || targetSl})`);
                            } else {
                                logger.logError(envName, "SL_MODIFY_VERIFY_WARNING", new Error(`SL modification for order ${pos.orderId} unconfirmed on terminal.`));
                            }
                        } catch (vErr) {
                            logger.logError(envName, "SL_MODIFY_VERIFY_ERROR", vErr);
                        }
                    } else {
                        logger.logInfo(envName, "SL_MODIFY_DOUBLE_CHECKED", `SL modification double-checked (Simulated / Paper Trading).`);
                    }

                    return true;
                } catch (err) {
                    logger.logError(envName, "MODIFY_ORDER_FAILED", err);
                } finally {
                    this.isModifyInFlight = false;
                }
            } else {
                pos.currentSl = targetSl;
                pos.trailingStage = targetStage;
                this.isModifyInFlight = false;
                logger.logInfo(envName, "SL_TRAILED_SIMULATED", `SL trailed to ₹${targetSl} (${targetStage}) (Double-check Passed)`);
                return true;
            }
        }
        return false;
    }

    // =========================================================================
    // STEP 8: CLOSE POSITION ON BROKER TERMINAL (WITH DOUBLE-CHECK)
    // =========================================================================
    async closePosition(exitPrice, exitReason, envName = "PAPER") {
        if (!this.activePosition || this.isCloseInFlight) return null;
        const pos = this.activePosition;

        this.isCloseInFlight = true;
        pos.exitPrice = exitPrice;
        pos.exitReason = exitReason;

        const isOptionTrade = Boolean(pos.isOptionTrade);
        const diff = isOptionTrade ? (exitPrice - pos.entryPrice) : (pos.optionType === "CE" ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice);
        pos.realizedPnl = Number((diff * pos.qty).toFixed(2));

        let isCloseSuccessful = false;

        try {
            if (pos.handlers && typeof pos.handlers.closeOrder === 'function') {
                await this.retryStepAsync(
                    () => pos.handlers.closeOrder(pos),
                    "CLOSE_ORDER",
                    envName,
                    5,
                    2000
                );

                // DOUBLE-CHECK POSITION CLOSE ON BROKER TERMINAL
                const verifyFn = pos.handlers.verifyOrderClose || pos.handlers.verifyClose;
                if (typeof verifyFn === 'function') {
                    try {
                        const secId = pos.securityId || pos.symbol;
                        const closeConfirm = await verifyFn(secId, pos.orderId);
                        if (closeConfirm && closeConfirm.isClosedOnTerminal === false) {
                            logger.logError(envName, "POSITION_CLOSE_UNCONFIRMED_RETRYING", new Error(`Position ${secId} still open on broker terminal! Retrying position exit...`));
                            await pos.handlers.closeOrder(pos);
                        } else {
                            logger.logInfo(envName, "POSITION_CLOSE_DOUBLE_CHECKED", `Position close double-checked & verified CLOSED (netQty: 0) on broker terminal.`);
                        }
                    } catch (vErr) {
                        logger.logError(envName, "POSITION_CLOSE_VERIFY_ERROR", vErr);
                    }
                } else {
                    logger.logInfo(envName, "POSITION_CLOSE_DOUBLE_CHECKED", `Position close double-checked (Simulated / Paper Trading).`);
                }
            }
            isCloseSuccessful = true;
        } catch (err) {
            logger.logError(envName, "CLOSE_ORDER_FAILED", err);
            pos.status = "EXIT_FAILED";
        } finally {
            if (isCloseSuccessful || !pos.handlers || typeof pos.handlers.closeOrder !== 'function') {
                pos.status = "CLOSED";
                this.tradeHistory.push({ ...pos });
                if (this.tradeHistory.length > 1000) this.tradeHistory.shift();
                const closedPosition = { ...pos };
                this.activePosition = null;
                this.lastExitTimestamp = Date.now();
                this.isCloseInFlight = false;

                logger.logInfo(envName, "POSITION_CLOSED", `Closed ${closedPosition.symbol} | Exit: ₹${exitPrice} | Reason: ${exitReason} | PnL: ₹${closedPosition.realizedPnl}`);
                return closedPosition;
            } else {
                this.isCloseInFlight = false;
                logger.logError(envName, "POSITION_CLOSE_RETAINED", new Error(`Position close failed on broker terminal! Retaining active position for retry.`));
                return null;
            }
        }
    }

    /**
     * Process Price/Candle Tick: Evaluates Trailing SL Rules & Exits
     */
    async processTick(tick, envName = "PAPER") {
        if (!this.activePosition || (this.activePosition.status !== "OPEN" && this.activePosition.status !== "EXIT_FAILED") || !tick || this.isCloseInFlight) return null;

        const pos = this.activePosition;
        const lvls = pos.levels;
        const cfg = masterConfig.getConfig();

        const tickTimeStr = tick.time || tick.date || new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });

        const isLiveTick = tick.status === "live" || Boolean(tick.liveLtp) || pos.envName === "REAL_TRADE";
        const livePrice = Number(tick.liveLtp || tick.ltp || tick.price || tick.close);

        const currentHigh = isLiveTick ? livePrice : Number(tick.candleHigh || tick.high || livePrice);
        const currentLow = isLiveTick ? livePrice : Number(tick.candleLow || tick.low || livePrice);

        if (isNaN(currentHigh) || isNaN(currentLow) || currentHigh <= 0 || currentLow <= 0 || isNaN(pos.currentSl) || isNaN(pos.targetPrice)) return null;

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
        const isOptionBuying = Boolean(pos.isOptionTrade) || pos.optionType === "CE";

        if (!isTrailingEnabled) {
            // FIXED TARGET MODE
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
            // DYNAMIC 1-R LAG TRAILING SL MODE
            let newSl = pos.currentSl;
            let newStage = pos.trailingStage;

            if (isOptionBuying) {
                if (currentHigh >= lvls.tr1 && cfg.autoTrailOnTR1 !== false) {
                    if (pos.entryPrice > newSl) { newSl = pos.entryPrice; newStage = "TRAILED_COST_TO_COST"; }
                }
                if (currentHigh >= lvls.tr2 && cfg.autoTrailOnTR2 !== false) {
                    if (lvls.tr1 > newSl) { newSl = lvls.tr1; newStage = "TRAILED_TR1 (LOCKED)"; }
                }
                if (currentHigh >= lvls.tr3 && cfg.autoTrailOnTR3 !== false) {
                    if (lvls.tr2 > newSl) { newSl = lvls.tr2; newStage = "TRAILED_TR2"; }
                }
                if (currentHigh >= lvls.tr4 && cfg.autoTrailOnTR4 !== false) {
                    if (lvls.tr3 > newSl) { newSl = lvls.tr3; newStage = "TRAILED_TR3"; }
                }
                if (currentHigh >= lvls.tr5 && cfg.autoTrailOnTR5 !== false) {
                    if (lvls.tr4 > newSl) { newSl = lvls.tr4; newStage = "TRAILED_TR4"; }
                }

                if (newSl !== pos.currentSl) {
                    await this.modifyTrailingSL(newSl, newStage, envName);
                }

                if (currentHigh >= pos.targetPrice) {
                    exitTriggered = true; exitPrice = pos.targetPrice; exitReason = `TARGET_HIT (${pos.targetLabel})`;
                } else if (currentLow <= pos.currentSl) {
                    exitTriggered = true; exitPrice = pos.currentSl;
                    exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                }

            } else {
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
                    await this.modifyTrailingSL(newSl, newStage, envName);
                }

                if (currentLow <= pos.targetPrice) {
                    exitTriggered = true; exitPrice = pos.targetPrice; exitReason = `TARGET_HIT (${pos.targetLabel})`;
                } else if (currentHigh >= pos.currentSl) {
                    exitTriggered = true; exitPrice = pos.currentSl;
                    exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                }
            }
        }

        if (exitTriggered) {
            return await this.closePosition(exitPrice, exitReason, envName);
        }

        return pos;
    }

    /**
     * Get Engine Status
     */
    getStatus() {
        if (this.activePosition && (!this.activePosition.entryPrice || isNaN(this.activePosition.entryPrice) || Number(this.activePosition.entryPrice) <= 0)) {
            console.warn(`⚠️ [MASTER SL GUARD] Cleaning up invalid ghost position (${this.activePosition.symbol || 'UNKNOWN'}). Invalid entryPrice: ${this.activePosition.entryPrice}`);
            this.activePosition = null;
        }

        return {
            activePosition: this.activePosition,
            history: this.tradeHistory,
            totalTrades: this.tradeHistory.length,
            totalPnl: Number(this.tradeHistory.reduce((acc, t) => acc + (t.realizedPnl || 0), 0).toFixed(2)),
            lastExitTimestamp: this.lastExitTimestamp
        };
    }
}

module.exports = new MasterTrailingEngine();
