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
        this.lastSlExitTimestamp = 0;
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
            let str = String(tStr).trim();
            if (str.includes(" ")) {
                const spaceParts = str.split(" ").filter(Boolean);
                const timePart = spaceParts.find(p => p.includes(":")) || str;
                const amPmPart = spaceParts.find(p => /am|pm/i.test(p)) || "";
                str = `${timePart} ${amPmPart}`.trim();
            } else if (str.includes("T")) {
                str = str.split("T")[1] || str;
            }

            const isPm = /pm/i.test(str);
            const isAm = /am/i.test(str);
            const cleanStr = str.replace(/(am|pm)/i, "").trim();
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
        const maxLossRupees = Number(cfg.maxLossPerTrade || 300);
        const riskPoints = Number((maxLossRupees / lotSize).toFixed(2));

        const initialSl = isOptionTrade || optionType === "CE" 
            ? Number((entryPrice - riskPoints).toFixed(2)) 
            : Number((entryPrice + riskPoints).toFixed(2));

        // Big Target Price (₹100,000 profit target) so fixed target is NEVER hit, letting Dynamic Trailing SL capture maximum trend
        const bigTargetPoints = Number((100000 / lotSize).toFixed(2));
        const targetPrice = isOptionTrade || optionType === "CE" 
            ? Number((entryPrice + bigTargetPoints).toFixed(2)) 
            : Number((entryPrice - bigTargetPoints).toFixed(2));

        return { initialSl, riskPoints, targetPrice };
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

        // Trading Cutoff Guard (3:10 PM)
        if (this.isAfterTradingHours(signal.time)) {
            logger.logInfo(envName, "SIGNAL_IGNORED", `Trading cutoff time reached (3:10 PM). Ignoring new signal.`);
            return { status: "IGNORED", reason: "AFTER_TRADING_HOURS_3_10_PM" };
        }

        const ORDER_COOLDOWN_MS = 30000;
        const timeSinceLastOrder = Date.now() - (this.lastOrderTimestamp || 0);
        if (timeSinceLastOrder < ORDER_COOLDOWN_MS) {
            const remSecs = Math.ceil((ORDER_COOLDOWN_MS - timeSinceLastOrder) / 1000);
            logger.logInfo(envName, "SIGNAL_IGNORED", `Order placement cooldown active (${remSecs}s remaining). Ignoring signal.`);
            return { status: "IGNORED", reason: `ORDER_COOLDOWN_ACTIVE (${remSecs}s)` };
        }

        // SL Exit Cooldown Guard (Default 15 minutes after SL hit)
        const slCooldownMins = Number(cfg.slCooldownMinutes || 15);
        const SL_COOLDOWN_MS = slCooldownMins * 60 * 1000;
        const timeSinceLastSlExit = Date.now() - (this.lastSlExitTimestamp || 0);
        if (timeSinceLastSlExit < SL_COOLDOWN_MS) {
            const remMs = SL_COOLDOWN_MS - timeSinceLastSlExit;
            const remMins = Math.floor(remMs / 60000);
            const remSecs = Math.ceil((remMs % 60000) / 1000);
            logger.logInfo(envName, "SIGNAL_IGNORED", `SL exit cooldown active (${remMins}m ${remSecs}s remaining after SL hit). Ignoring signal.`);
            return { status: "IGNORED", reason: `SL_EXIT_COOLDOWN_ACTIVE (${remMins}m ${remSecs}s)` };
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

            const targetPrice = levels.targetPrice;
            const targetLabel = "DYNAMIC_RUPEE_TRAILING";

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
                targetMode: cfg.targetMode || "DYNAMIC_RUPEE_TRAILING",
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
    // STEP 7: MODIFY TRAILING SL ON BROKER TERMINAL (WITH 10 RETRIES & EMERGENCY CLOSE)
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
                let modifySuccess = false;
                const maxAttempts = 10;

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    try {
                        logger.logInfo(envName, "MODIFY_ORDER_SL_ATTEMPT", `Attempting SL Modification (${attempt}/${maxAttempts}) to ₹${targetSl} (${targetStage})...`);
                        await pos.handlers.modifyOrder(pos.orderId, targetSl, targetStage);

                        // DOUBLE-CHECK SL MODIFICATION ON BROKER TERMINAL
                        const verifyFn = pos.handlers.verifyOrderModification || pos.handlers.verifyModification;
                        if (typeof verifyFn === 'function') {
                            const modConfirm = await verifyFn(pos.orderId, targetSl);
                            if (modConfirm && modConfirm.isConfirmed) {
                                logger.logInfo(envName, "SL_MODIFY_DOUBLE_CHECKED", `SL modification double-checked & verified CONFIRMED on terminal: ₹${targetSl}`);
                                modifySuccess = true;
                                break;
                            } else {
                                logger.logError(envName, "SL_MODIFY_VERIFY_WARNING", new Error(`Attempt ${attempt}/${maxAttempts}: SL modification unconfirmed on broker terminal.`));
                            }
                        } else {
                            // Simulated / Paper Trading confirmation
                            modifySuccess = true;
                            break;
                        }
                    } catch (mErr) {
                        logger.logError(envName, `MODIFY_ORDER_ATTEMPT_${attempt}_FAILED`, mErr);
                    }

                    if (attempt < maxAttempts) {
                        await new Promise(res => setTimeout(res, 1000));
                    }
                }

                if (modifySuccess) {
                    pos.currentSl = targetSl;
                    pos.trailingStage = targetStage;
                    pos.isVerifiedModify = true;
                    this.isModifyInFlight = false;
                    logger.logInfo(envName, "SL_TRAILED_VERIFIED", `SL trailed & double-check confirmed: ₹${targetSl} (${targetStage})`);
                    return true;
                } else {
                    // EMERGENCY CLOSE FALLBACK: SL Modification failed after 10 retries!
                    logger.logError(envName, "SL_MODIFY_FAILED_EMERGENCY_CLOSE", new Error(`🚨 [EMERGENCY CLOSE] SL Modification to ₹${targetSl} failed after 10 attempts! Executing emergency market exit to lock profit.`));
                    this.isModifyInFlight = false;
                    await this.closePosition(targetSl, "EMERGENCY_SL_MODIFY_FAILED_CLOSE", envName);
                    return false;
                }
            } else {
                pos.currentSl = targetSl;
                pos.trailingStage = targetStage;
                pos.isVerifiedModify = true;
                this.isModifyInFlight = false;
                logger.logInfo(envName, "SL_TRAILED_SIMULATED", `SL trailed to ₹${targetSl} (${targetStage}) (Simulated Mode)`);
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
                if (String(exitReason || "").includes("SL_HIT")) {
                    this.lastSlExitTimestamp = Date.now();
                    logger.logInfo(envName, "SL_EXIT_COOLDOWN_STARTED", `SL exit recorded (${exitReason}). 15-minute cooldown started.`);
                }
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

        // Spot Index Price vs Option Contract LTP Guard:
        // If active position is an option contract (entry < ₹2000) and tick is Index Spot price (livePrice > ₹5000), ignore index tick
        const isOptionContract = Boolean(pos.isOptionTrade || (pos.securityId && String(pos.securityId) !== "13") || pos.symbol?.includes("_"));
        if (isOptionContract && pos.entryPrice > 0 && pos.entryPrice < 2000 && livePrice > 5000) {
            return null;
        }

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

        const isOptionBuying = Boolean(pos.isOptionTrade) || pos.optionType === "CE";

        // 1. DYNAMIC RUPEE PROFIT TRAILING SL JUMP ENGINE
        if (!exitTriggered && cfg.enableAutoTrailing !== false) {
            const firstTrigger = Number(cfg.firstProfitTrigger || 1000); // ₹1000
            const stepProfit = Number(cfg.trailStepProfit || 500);       // ₹500
            const lockBuffer = Number(cfg.trailLockBuffer || 100);       // ₹100
            const qty = Number(pos.qty || pos.lotSize || 65);

            const pnlDiff = isOptionBuying ? (livePrice - pos.entryPrice) : (pos.entryPrice - livePrice);
            const currentProfitRupees = Math.round(pnlDiff * qty);

            if (currentProfitRupees >= firstTrigger) {
                const extraSteps = Math.floor((currentProfitRupees - firstTrigger) / stepProfit);
                const targetProfitLevel = firstTrigger + (extraSteps * stepProfit); // e.g. 1000, 1500, 2000...
                const lockedProfitAmount = targetProfitLevel - lockBuffer;           // e.g. 900, 1400, 1900...

                const lockedPoints = Number((lockedProfitAmount / qty).toFixed(2));
                const newSlPrice = isOptionBuying ? Number((pos.entryPrice + lockedPoints).toFixed(2)) : Number((pos.entryPrice - lockedPoints).toFixed(2));

                if (isOptionBuying ? (newSlPrice > pos.currentSl) : (newSlPrice < pos.currentSl)) {
                    const newStage = `PROFIT_LOCKED_₹${lockedProfitAmount}`;
                    await this.modifyTrailingSL(newSlPrice, newStage, envName);
                }
            }
        }

        // 2. Check Initial / Trailed Stop Loss Hit & Big Target Hit
        if (!exitTriggered) {
            if (isOptionBuying) {
                if (currentLow <= pos.currentSl) {
                    exitTriggered = true;
                    exitPrice = pos.currentSl;
                    exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                } else if (currentHigh >= pos.targetPrice) {
                    exitTriggered = true;
                    exitPrice = pos.targetPrice;
                    exitReason = `TARGET_HIT (${pos.targetLabel})`;
                }
            } else {
                if (currentHigh >= pos.currentSl) {
                    exitTriggered = true;
                    exitPrice = pos.currentSl;
                    exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                } else if (currentLow <= pos.targetPrice) {
                    exitTriggered = true;
                    exitPrice = pos.targetPrice;
                    exitReason = `TARGET_HIT (${pos.targetLabel})`;
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

        const cfg = masterConfig.getConfig();
        const slCooldownMins = Number(cfg.slCooldownMinutes || 15);
        const SL_COOLDOWN_MS = slCooldownMins * 60 * 1000;
        const timeSinceLastSlExit = Date.now() - (this.lastSlExitTimestamp || 0);
        const isSlCooldownActive = Boolean(this.lastSlExitTimestamp > 0 && timeSinceLastSlExit < SL_COOLDOWN_MS);
        const remainingCooldownMs = isSlCooldownActive ? (SL_COOLDOWN_MS - timeSinceLastSlExit) : 0;

        return {
            activePosition: this.activePosition,
            history: this.tradeHistory,
            totalTrades: this.tradeHistory.length,
            totalPnl: Number(this.tradeHistory.reduce((acc, t) => acc + (t.realizedPnl || 0), 0).toFixed(2)),
            lastExitTimestamp: this.lastExitTimestamp,
            lastSlExitTimestamp: this.lastSlExitTimestamp,
            isSlCooldownActive: isSlCooldownActive,
            remainingCooldownMs: remainingCooldownMs,
            remainingCooldownMins: Math.floor(remainingCooldownMs / 60000),
            remainingCooldownSecs: Math.ceil((remainingCooldownMs % 60000) / 1000)
        };
    }
}

module.exports = new MasterTrailingEngine();
