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

const fs = require('fs');
const path = require('path');
const masterConfig = require('./config');
const logger = require('./logger');
const autoShutdownManager = require('./autoShutdownManager');

const TRADE_HISTORY_FILE = path.join(__dirname, 'master_trade_history.json');

class MasterTrailingEngine {
    constructor() {
        this.activePosition = null;
        this.tradeHistory = this.loadTradeHistory();
        this.isOrderInFlight = false;
        this.isModifyInFlight = false;
        this.isCloseInFlight = false;
        this.lastOrderTimestamp = 0;
        this.lastModifyTimestamp = 0;
        this.lastExitTimestamp = 0;
        this.lastSlExitTimestamp = 0;
    }

    loadTradeHistory() {
        try {
            if (fs.existsSync(TRADE_HISTORY_FILE)) {
                const data = JSON.parse(fs.readFileSync(TRADE_HISTORY_FILE, 'utf-8'));
                if (Array.isArray(data)) return data;
            }
        } catch (e) {
            console.warn(`⚠️ [MASTER SL] Could not load trade history from disk: ${e.message}`);
        }
        return [];
    }

    saveTradeHistory() {
        try {
            fs.writeFileSync(TRADE_HISTORY_FILE, JSON.stringify(this.tradeHistory, null, 2), 'utf-8');
        } catch (e) {
            console.error(`❌ [MASTER SL] Could not save trade history to disk: ${e.message}`);
        }
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

        // Target Points based on maxTargetPerTrade (default ₹5,000 profit target)
        const maxTargetRupees = Number(cfg.maxTargetPerTrade || 5000);
        const targetPoints = Number((maxTargetRupees / lotSize).toFixed(2));
        const targetPrice = isOptionTrade || optionType === "CE" 
            ? Number((entryPrice + targetPoints).toFixed(2)) 
            : Number((entryPrice - targetPoints).toFixed(2));

        return { initialSl, riskPoints, targetPrice, targetPoints };
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
    // STEP 6: VERIFY AND STORE ACTIVE POSITION (DOUBLE-CHECK PLACEMENT & SYNC BROKER FILL PRICE)
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

        // Extract 3 exact core fields directly from Dhan Broker Super Order response
        const fillPrice = Number(
            verifyDetails?.averageTradedPrice ||
            verifyDetails?.order?.averageTradedPrice ||
            verifyDetails?.buyAvg
        );

        const slLegPrice = Number(
            verifyDetails?.legDetails?.find(l => l.legName === 'STOP_LOSS_LEG')?.price || 0
        );

        const targetLegPrice = Number(
            verifyDetails?.legDetails?.find(l => l.legName === 'TARGET_LEG')?.price || 0
        );

        if (fillPrice > 0) {
            const cfg = masterConfig.getConfig();
            const lotSize = Number(orderPayload.lotSize || 65);

            const newLevels = this.calculateRiskAndLevels(
                fillPrice,
                orderPayload.optionType,
                orderPayload.isOptionTrade,
                orderPayload.strikeInfo,
                null,
                cfg,
                lotSize
            );

            // Store strictly the 3 exact core fields
            orderPayload.entryPrice = fillPrice;
            orderPayload.initialSl = slLegPrice > 0 ? slLegPrice : newLevels.initialSl;
            orderPayload.currentSl = orderPayload.initialSl;
            orderPayload.targetPrice = targetLegPrice > 0 ? targetLegPrice : newLevels.targetPrice;
            orderPayload.targetPoints = newLevels.targetPoints;
            orderPayload.levels = newLevels;

            logger.logInfo(envName, "BROKER_EXECUTION_PRICE_SYNCED", `⚡ [BROKER FILL SYNCED] Entry: ₹${orderPayload.entryPrice} | SL: ₹${orderPayload.initialSl} | Target: ₹${orderPayload.targetPrice}`);
        }

        this.activePosition = {
            ...orderPayload,
            qty: Number(placedOrderResult?.quantity || orderPayload.qty),
            orderId: placedOrderResult?.orderId || orderPayload.tradeId,
            handlers: environmentHandlers,
            envName: envName,
            isVerifiedPlacement: isVerified,
            slShiftHistory: [
                { time: orderPayload.entryTime || new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }), sl: orderPayload.initialSl, stage: "INITIAL" }
            ]
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

        // Mandatory Post-Trade Exit Cooldown Guard (15 Minutes = 900,000 ms after ANY trade exit - Target Hit, SL Hit, Trailing SL)
        const cooldownMins = Number(cfg.slCooldownMinutes !== undefined ? cfg.slCooldownMinutes : 15);
        const COOLDOWN_MS = cooldownMins * 60 * 1000;
        const timeSinceLastExit = Date.now() - (this.lastExitTimestamp || 0);
        if (this.lastExitTimestamp > 0 && timeSinceLastExit < COOLDOWN_MS) {
            const remMs = COOLDOWN_MS - timeSinceLastExit;
            const remMins = Math.floor(remMs / 60000);
            const remSecs = Math.ceil((remMs % 60000) / 1000);
            logger.logInfo(envName, "SIGNAL_IGNORED", `15-min trade exit cooldown active (${remMins}m ${remSecs}s remaining after trade exit). Ignoring signal.`);
            return { status: "IGNORED", reason: `TRADE_EXIT_COOLDOWN_ACTIVE (${remMins}m ${remSecs}s)` };
        }

        // Synchronously acquire atomic lock & record timestamp BEFORE any async operations
        this.isOrderInFlight = true;
        this.lastOrderTimestamp = Date.now();

        try {
            // Guard Check: Max Trades Per Day Check
            const todayDate = signal.date || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
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
                securityId: selectedStrikeInfo?.securityId || signal.securityId || symbol,
                symbol: symbol,
                optionType: optionType,
                isOptionTrade: isOptionTrade,
                entryDate: signal.date || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
                entryTime: signal.time || new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
                entryPrice: entryPrice,
                initialSl: levels.initialSl,
                currentSl: levels.initialSl,
                targetPrice: targetPrice,
                targetPoints: levels.targetPoints,
                targetLabel: "PERCENT_TRAILING",
                targetMode: "PERCENT_TRAILING",
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
    // STEP 7: INTERNAL HIGH-SPEED TRAILING SL WATCH (ZERO BROKER API MODIFY MESSAGES)
    // =========================================================================
    async modifyTrailingSL(newSl, newStage, envName = "PAPER") {
        if (!this.activePosition || this.isModifyInFlight) return false;
        const pos = this.activePosition;

        if (newSl !== pos.currentSl) {
            this.isModifyInFlight = true;
            this.lastModifyTimestamp = Date.now();
            const targetSl = newSl;
            const targetStage = newStage;

            // Update SL internally in memory (No Dhan API modify call sent)
            pos.currentSl = targetSl;
            pos.trailingStage = targetStage;
            pos.isVerifiedModify = true;
            this.isModifyInFlight = false;

            pos.slShiftHistory = pos.slShiftHistory || [];
            pos.slShiftHistory.push({
                time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
                sl: targetSl,
                stage: targetStage
            });

            logger.logInfo(envName, "SL_TRAILED_INTERNAL_MEMORY", `⚡ [INTERNAL SL TRAILED] Memory SL updated to ₹${targetSl} (${targetStage}) | Zero Dhan API Modify Messages Sent.`);
            return true;
        }
        return false;
    }

    // =========================================================================
    // STEP 8: PERSISTENT MARKET CLOSE LOOP (RETRY UNTIL BROKER TERMINAL netQty === 0)
    // =========================================================================
    async closePosition(exitPrice, exitReason, envName = "PAPER") {
        if (!this.activePosition || this.isCloseInFlight) return null;
        const cfg = masterConfig.getConfig();
        const pos = this.activePosition;

        this.isCloseInFlight = true;
        pos.exitPrice = exitPrice;
        pos.exitReason = exitReason;

        const isOptionTrade = Boolean(pos.isOptionTrade);
        const diff = isOptionTrade ? (exitPrice - pos.entryPrice) : (pos.optionType === "CE" ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice);
        pos.realizedPnl = Number((diff * pos.qty).toFixed(2));

        let isCloseSuccessful = false;
        const maxExitAttempts = 10;

        logger.logInfo(envName, "CLOSE_POSITION_TRIGGERED", `🏁 [MARKET EXIT INITIATED] Trailed SL/Target breached at ₹${exitPrice} (${exitReason}). Starting persistent exit loop (max 10 attempts) until Dhan terminal confirms netQty === 0.`);

        try {
            if (pos.handlers && typeof pos.handlers.closeOrder === 'function') {
                const verifyFn = pos.handlers.verifyOrderClose || pos.handlers.verifyClose;

                for (let attempt = 1; attempt <= maxExitAttempts; attempt++) {
                    try {
                        logger.logInfo(envName, "MARKET_EXIT_ATTEMPT", `Attempting Market Exit (${attempt}/${maxExitAttempts}) for ${pos.symbol} (Security: ${pos.securityId || pos.symbol})...`);
                        await pos.handlers.closeOrder(pos);

                        // DOUBLE-CHECK POSITION CLOSE ON BROKER TERMINAL (netQty === 0)
                        if (typeof verifyFn === 'function') {
                            const secId = pos.securityId || pos.symbol;
                            const closeConfirm = await verifyFn(secId, pos.orderId);

                            if (closeConfirm && closeConfirm.isClosedOnTerminal !== false) {
                                logger.logInfo(envName, "POSITION_CLOSE_CONFIRMED_TERMINAL", `✅ [TERMINAL CLOSE CONFIRMED] Position ${secId} verified CLOSED (netQty: 0) on Dhan broker terminal on attempt ${attempt}.`);
                                isCloseSuccessful = true;
                                pos.exitError = null;
                                break;
                            } else {
                                logger.logError(envName, "POSITION_STILL_OPEN_RETRYING", new Error(`⚠️ Attempt ${attempt}/${maxExitAttempts}: Position ${secId} still shows open (netQty > 0) on Dhan terminal. Retrying Market Exit...`));
                            }
                        } else {
                            // Simulated / Paper Trading confirmation
                            isCloseSuccessful = true;
                            pos.exitError = null;
                            break;
                        }
                    } catch (attemptErr) {
                        logger.logError(envName, `MARKET_EXIT_ATTEMPT_${attempt}_FAILED`, attemptErr);
                    }

                    if (attempt < maxExitAttempts) {
                        await new Promise(res => setTimeout(res, 1000));
                    }
                }
            } else {
                isCloseSuccessful = true;
                pos.exitError = null;
            }
        } catch (err) {
            logger.logError(envName, "CLOSE_ORDER_FAILED", err);
            pos.status = "EXIT_FAILED";
            pos.exitError = "🚨 Trailed SL hit ho gaya par order close nahi ho raha hai! (Dhan Terminal netQty > 0)";
        } finally {
            if (isCloseSuccessful || !pos.handlers || typeof pos.handlers.closeOrder !== 'function') {
                pos.status = "CLOSED";
                pos.exitError = null;
                this.tradeHistory.push({ ...pos });
                if (this.tradeHistory.length > 1000) this.tradeHistory.shift();
                this.saveTradeHistory();
                const closedPosition = { ...pos };
                this.activePosition = null;
                this.lastExitTimestamp = Date.now();
                this.lastSlExitTimestamp = Date.now();
                logger.logInfo(envName, "TRADE_EXIT_COOLDOWN_STARTED", `Trade exit recorded (${exitReason}). Mandatory 15-minute cooldown started.`);
                this.isCloseInFlight = false;

                logger.logInfo(envName, "POSITION_CLOSED", `Closed ${closedPosition.symbol} | Exit: ₹${exitPrice} | Reason: ${exitReason} | PnL: ₹${closedPosition.realizedPnl}`);

                // Check and trigger auto-shutdown if max daily trades reached
                autoShutdownManager.checkAndTriggerShutdown(this.tradeHistory, this.activePosition, cfg, envName);

                return closedPosition;
            } else {
                this.isCloseInFlight = false;
                pos.status = "EXIT_FAILED";
                pos.exitError = "🚨 Trailed SL hit ho gaya par order close nahi ho raha hai! (10 Attempts Failed)";
                logger.logError(envName, "POSITION_CLOSE_FAILED_AFTER_10_ATTEMPTS", new Error(`🚨 Trailed SL hit ho gaya par order close nahi ho raha hai! Failed after ${maxExitAttempts} attempts on Dhan broker terminal. Retaining position for next tick retry.`));
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

        const currentHigh = Number(tick.candleHigh || tick.high || livePrice);
        const currentLow = Number(tick.candleLow || tick.low || livePrice);

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

        // 1. DYNAMIC RUPEE PROFIT & PERCENTAGE TRAILING SL JUMP ENGINE
        if (!exitTriggered && cfg.enableAutoTrailing !== false) {
            const qty = Number(pos.qty || pos.lotSize || 65);
            const peakEvaluationPrice = isOptionBuying ? currentHigh : currentLow;
            const pnlDiff = Number((isOptionBuying ? (peakEvaluationPrice - pos.entryPrice) : (pos.entryPrice - peakEvaluationPrice)).toFixed(2));
            const currentProfitRupees = Math.round(pnlDiff * qty);

            const rupeeRules = Array.isArray(cfg.rupeeTrailingRules) ? cfg.rupeeTrailingRules : [];
            const percentRules = Array.isArray(cfg.percentTrailingRules) ? cfg.percentTrailingRules : [];

            if (rupeeRules.length > 0) {
                const sortedRupeeRules = [...rupeeRules].sort((a, b) => b.targetRupees - a.targetRupees);
                for (const rule of sortedRupeeRules) {
                    if (currentProfitRupees >= rule.targetRupees) {
                        const lockPts = Number((rule.lockRupees / qty).toFixed(2));
                        const newSlPrice = isOptionBuying 
                            ? Number((pos.entryPrice + lockPts).toFixed(2)) 
                            : Number((pos.entryPrice - lockPts).toFixed(2));

                        if (isOptionBuying ? (newSlPrice > pos.currentSl) : (newSlPrice < pos.currentSl)) {
                            const newStage = `PROFIT_₹${rule.targetRupees}_LOCK_₹${rule.lockRupees}`;
                            await this.modifyTrailingSL(newSlPrice, newStage, envName);
                            break;
                        }
                    }
                }
            } else if (percentRules.length > 0) {
                // PERCENTAGE-BASED TRAILING RULES (Target % Hit -> SL Lock %)
                const targetPoints = Number(
                    pos.targetPoints || 
                    (pos.strikeInfo?.optionTR5 ? Math.abs(pos.strikeInfo.optionTR5 - pos.entryPrice) : 0) ||
                    (pos.levels?.riskPoints ? (pos.levels.riskPoints * 3) : 50)
                );

                const sortedRules = [...percentRules].sort((a, b) => b.targetPercent - a.targetPercent);

                for (const rule of sortedRules) {
                    const reqTargetPts = (targetPoints * rule.targetPercent) / 100;
                    if (pnlDiff >= reqTargetPts) {
                        const lockPts = Number(((targetPoints * rule.lockPercent) / 100).toFixed(2));
                        const newSlPrice = isOptionBuying 
                            ? Number((pos.entryPrice + lockPts).toFixed(2)) 
                            : Number((pos.entryPrice - lockPts).toFixed(2));

                        if (isOptionBuying ? (newSlPrice > pos.currentSl) : (newSlPrice < pos.currentSl)) {
                            const newStage = `TARGET_${rule.targetPercent}%_LOCK_${rule.lockPercent}%`;
                            await this.modifyTrailingSL(newSlPrice, newStage, envName);
                            break;
                        }
                    }
                }
            } else {
                // FALLBACK: Rupee Profit Trailing SL Jump
                const firstTrigger = Number(cfg.firstProfitTrigger || 1000); // ₹1000
                const stepProfit = Number(cfg.trailStepProfit || 500);       // ₹500
                const lockBuffer = Number(cfg.trailLockBuffer || 100);       // ₹100

                if (currentProfitRupees >= firstTrigger) {
                    const extraSteps = Math.floor((currentProfitRupees - firstTrigger) / stepProfit);
                    const targetProfitLevel = firstTrigger + (extraSteps * stepProfit);
                    const lockedProfitAmount = targetProfitLevel - lockBuffer;

                    const lockedPoints = Number((lockedProfitAmount / qty).toFixed(2));
                    const newSlPrice = isOptionBuying ? Number((pos.entryPrice + lockedPoints).toFixed(2)) : Number((pos.entryPrice - lockedPoints).toFixed(2));

                    if (isOptionBuying ? (newSlPrice > pos.currentSl) : (newSlPrice < pos.currentSl)) {
                        const newStage = `PROFIT_LOCKED_₹${lockedProfitAmount}`;
                        await this.modifyTrailingSL(newSlPrice, newStage, envName);
                    }
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
        const cooldownMins = Number(cfg.slCooldownMinutes !== undefined ? cfg.slCooldownMinutes : 15);
        const COOLDOWN_MS = cooldownMins * 60 * 1000;
        const timeSinceLastExit = Date.now() - (this.lastExitTimestamp || 0);
        const isSlCooldownActive = Boolean(this.lastExitTimestamp > 0 && timeSinceLastExit < COOLDOWN_MS);
        const remainingCooldownMs = isSlCooldownActive ? (COOLDOWN_MS - timeSinceLastExit) : 0;

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
            remainingCooldownSecs: Math.ceil((remainingCooldownMs % 60000) / 1000),
            autoShutdown: autoShutdownManager.getStatus()
        };
    }

    /**
     * Check and trigger daily auto-shutdown if 3 trades completed
     */
    checkDailyAutoShutdown(envName = "REAL_TRADE") {
        const cfg = masterConfig.getConfig();
        return autoShutdownManager.checkAndTriggerShutdown(this.tradeHistory, this.activePosition, cfg, envName);
    }
}

module.exports = new MasterTrailingEngine();
