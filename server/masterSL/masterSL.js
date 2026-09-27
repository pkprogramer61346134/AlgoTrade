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

class MasterTrailingEngine {
    constructor() {
        this.activePosition = null;
        this.tradeHistory = [];
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

        // 1. Guard Check: Single Open Position Guard
        if (this.activePosition && this.activePosition.status === "OPEN") {
            logger.logInfo(envName, "SIGNAL_IGNORED", `Position already open (${this.activePosition.symbol}). Ignoring signal.`);
            return { status: "IGNORED", reason: "POSITION_ALREADY_OPEN" };
        }

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

        try {
            // STEP 1: Balance Check (With 5 Retries)
            const availableBalance = await this.retryStepAsync(
                async () => {
                    if (typeof environmentHandlers.checkBalance === 'function') {
                        return await environmentHandlers.checkBalance();
                    }
                    return 10000; // Default dummy fallback balance if missing
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

            const symbol = selectedStrikeInfo?.symbol || `NIFTY_${optionType}`;
            const entryPrice = Number(selectedStrikeInfo?.ltp || entrySpotPrice);
            const lotSize = Number(selectedStrikeInfo?.lotSize || 65);

            // STEP 3: Risk & Targets Calculation (Max Loss Capping e.g. ₹300)
            let initialSl;
            let riskPoints;

            if (cfg.maxLossPerTrade && Number(cfg.maxLossPerTrade) > 0) {
                const maxLossRupees = Number(cfg.maxLossPerTrade);
                riskPoints = Number((maxLossRupees / lotSize).toFixed(2));
                initialSl = optionType === "CE" ? Number((entryPrice - riskPoints).toFixed(2)) : Number((entryPrice + riskPoints).toFixed(2));
            } else {
                initialSl = Number(signal.sl || (optionType === "CE" ? entryPrice - 25 : entryPrice + 25));
                riskPoints = Math.abs(entryPrice - initialSl);
            }

            // Dynamic Targets: TR1 (1:1), TR2 (1:2), TR3 (1:3), TR4 (1:4)
            let tr1, tr2, tr3, tr4;
            if (optionType === "CE") {
                tr1 = Number((entryPrice + riskPoints).toFixed(2));
                tr2 = Number((entryPrice + (riskPoints * 2)).toFixed(2));
                tr3 = Number((entryPrice + (riskPoints * 3)).toFixed(2));
                tr4 = Number((entryPrice + (riskPoints * 4)).toFixed(2));
            } else {
                tr1 = Number((entryPrice - riskPoints).toFixed(2));
                tr2 = Number((entryPrice - (riskPoints * 2)).toFixed(2));
                tr3 = Number((entryPrice - (riskPoints * 3)).toFixed(2));
                tr4 = Number((entryPrice - (riskPoints * 4)).toFixed(2));
            }

            const tr1Midway = Number((tr1 + ((tr2 - tr1) / 2)).toFixed(2));
            const tr2Midway = Number((tr2 + ((tr3 - tr2) / 2)).toFixed(2));

            // Target Mode determination ("1:1", "1:2", "1:3", "1:4", "TRAILING")
            const mode = String(cfg.targetMode || "TRAILING").toUpperCase();
            let targetPrice = tr4;
            let targetLabel = "TR4 (1:4)";

            if (mode.includes("1:1")) { targetPrice = tr1; targetLabel = "TR1 (1:1)"; }
            else if (mode.includes("1:2")) { targetPrice = tr2; targetLabel = "TR2 (1:2)"; }
            else if (mode.includes("1:3")) { targetPrice = tr3; targetLabel = "TR3 (1:3)"; }
            else if (mode.includes("1:4")) { targetPrice = tr4; targetLabel = "TR4 (1:4)"; }

            const orderPayload = {
                tradeId: "MASTER_SL_" + (this.tradeHistory.length + 1),
                symbol: symbol,
                optionType: optionType,
                entryDate: signal.date || new Date().toLocaleDateString("en-CA"),
                entryTime: signal.time || new Date().toLocaleTimeString("en-IN"),
                entryPrice: entryPrice,
                initialSl: initialSl,
                currentSl: initialSl,
                targetPrice: targetPrice,
                targetLabel: targetLabel,
                targetMode: mode,
                qty: lotSize,
                levels: { initialSl, tr1, tr1Midway, tr2, tr2Midway, tr3, tr4 },
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
                orderId: placedOrderResult?.orderId || orderPayload.tradeId,
                handlers: environmentHandlers
            };

            logger.logInfo(envName, "ORDER_EXECUTED", `Position Opened: ${symbol} | Entry: ₹${entryPrice} | SL: ₹${initialSl} | Target (${targetLabel}): ₹${targetPrice}`);
            return { status: "EXECUTED", position: this.activePosition };

        } catch (err) {
            logger.logError(envName, "SIGNAL_EXECUTION_FAILED", err);
            return null;
        }
    }

    /**
     * Process Price/Candle Tick: Evaluates Trailing SL Rules & Exits
     * 
     * @param {Object} tick - Current tick { high, low, close, price }
     * @param {string} [envName="PAPER"] - Environment Name
     * @returns {Promise<Object|null>} Closed position if exited, otherwise active position
     */
    async processTick(tick, envName = "PAPER") {
        if (!this.activePosition || this.activePosition.status !== "OPEN" || !tick) return null;

        const pos = this.activePosition;
        const lvls = pos.levels;
        const cfg = masterConfig.getConfig();
        const buffer = cfg.breathingRoomPoints || 0.50; // Breathing room buffer

        const currentHigh = Number(tick.candleHigh || tick.high || tick.close || tick.price);
        const currentLow = Number(tick.candleLow || tick.low || tick.close || tick.price);

        let exitTriggered = false;
        let exitPrice = 0;
        let exitReason = "";

        const mode = String(pos.targetMode || cfg.targetMode || "TRAILING").toUpperCase();
        const isTrailingEnabled = mode.includes("TRAIL");

        if (!isTrailingEnabled) {
            // FIXED TARGET MODE (NO TRAILING SL)
            if (pos.optionType === "CE") {
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
            // DYNAMIC 4-STAGE TRAILING SL MODE
            let newSl = pos.currentSl;
            let newStage = pos.trailingStage;

            if (pos.optionType === "CE") {
                if (currentHigh >= lvls.tr1 && pos.trailingStage === "INITIAL" && cfg.autoTrailOnTR1) {
                    newSl = Math.max(pos.currentSl, pos.entryPrice);
                    newStage = "TRAILED_COST_TO_COST";
                }
                if (currentHigh >= lvls.tr1Midway && pos.trailingStage === "TRAILED_COST_TO_COST") {
                    const targetSl = Number((lvls.tr1 - buffer).toFixed(2));
                    if (targetSl > newSl) { newSl = targetSl; newStage = "TRAILED_TR1_MIDWAY"; }
                }
                if (currentHigh >= lvls.tr2 && (pos.trailingStage === "TRAILED_COST_TO_COST" || pos.trailingStage === "TRAILED_TR1_MIDWAY") && cfg.autoTrailOnTR2) {
                    if (lvls.tr1 > newSl) { newSl = lvls.tr1; newStage = "TRAILED_TR1"; }
                }
                if (currentHigh >= lvls.tr2Midway && pos.trailingStage === "TRAILED_TR1") {
                    const targetSl = Number((lvls.tr2 - buffer).toFixed(2));
                    if (targetSl > newSl) { newSl = targetSl; newStage = "TRAILED_TR2_MIDWAY"; }
                }
                if (currentHigh >= lvls.tr3 && (pos.trailingStage === "TRAILED_TR1" || pos.trailingStage === "TRAILED_TR2_MIDWAY") && cfg.autoTrailOnTR3) {
                    if (lvls.tr2 > newSl) { newSl = lvls.tr2; newStage = "TRAILED_TR2"; }
                }

                if (currentHigh >= lvls.tr4) {
                    exitTriggered = true; exitPrice = lvls.tr4; exitReason = "TR4_TARGET_HIT (1:4)";
                } else if (currentLow <= pos.currentSl) {
                    exitTriggered = true; exitPrice = pos.currentSl;
                    exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                }

            } else if (pos.optionType === "PE") {
                if (currentLow <= lvls.tr1 && pos.trailingStage === "INITIAL" && cfg.autoTrailOnTR1) {
                    newSl = Math.min(pos.currentSl, pos.entryPrice);
                    newStage = "TRAILED_COST_TO_COST";
                }
                if (currentLow <= lvls.tr1Midway && pos.trailingStage === "TRAILED_COST_TO_COST") {
                    const targetSl = Number((lvls.tr1 + buffer).toFixed(2));
                    if (targetSl < newSl) { newSl = targetSl; newStage = "TRAILED_TR1_MIDWAY"; }
                }
                if (currentLow <= lvls.tr2 && (pos.trailingStage === "TRAILED_COST_TO_COST" || pos.trailingStage === "TRAILED_TR1_MIDWAY") && cfg.autoTrailOnTR2) {
                    if (lvls.tr1 < newSl) { newSl = lvls.tr1; newStage = "TRAILED_TR1"; }
                }
                if (currentLow <= lvls.tr2Midway && pos.trailingStage === "TRAILED_TR1") {
                    const targetSl = Number((lvls.tr2 + buffer).toFixed(2));
                    if (targetSl < newSl) { newSl = targetSl; newStage = "TRAILED_TR2_MIDWAY"; }
                }
                if (currentLow <= lvls.tr3 && (pos.trailingStage === "TRAILED_TR1" || pos.trailingStage === "TRAILED_TR2_MIDWAY") && cfg.autoTrailOnTR3) {
                    if (lvls.tr2 < newSl) { newSl = lvls.tr2; newStage = "TRAILED_TR2"; }
                }

                if (currentLow <= lvls.tr4) {
                    exitTriggered = true; exitPrice = lvls.tr4; exitReason = "TR4_TARGET_HIT (1:4)";
                } else if (currentHigh >= pos.currentSl) {
                    exitTriggered = true; exitPrice = pos.currentSl;
                    exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                }
            }

            // If SL updated, invoke modifyOrder handler
            if (newSl !== pos.currentSl && !exitTriggered) {
                pos.currentSl = newSl;
                pos.trailingStage = newStage;

                if (pos.handlers && typeof pos.handlers.modifyOrder === 'function') {
                    try {
                        await this.retryStepAsync(
                            () => pos.handlers.modifyOrder(pos.orderId, newSl, newStage),
                            "MODIFY_ORDER_SL",
                            envName,
                            cfg.maxRetriesPerStep || 5,
                            cfg.retryDelayMs || 1000
                        );
                    } catch (err) {
                        logger.logError(envName, "MODIFY_ORDER_FAILED", err);
                    }
                }
                logger.logInfo(envName, "SL_TRAILED", `SL trailed to ₹${newSl} (${newStage})`);
            }
        }

        // On Trade Exit
        if (exitTriggered) {
            pos.status = "CLOSED";
            pos.exitPrice = exitPrice;
            pos.exitReason = exitReason;

            const diff = pos.optionType === "CE" ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
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

            logger.logInfo(envName, "POSITION_CLOSED", `Closed ${closedPosition.symbol} | Exit: ₹${exitPrice} | Reason: ${exitReason} | PnL: ₹${closedPosition.realizedPnl}`);
            return closedPosition;
        }

        return pos;
    }

    /**
     * Get Engine Status
     */
    getStatus() {
        return {
            activePosition: this.activePosition,
            history: this.tradeHistory,
            totalTrades: this.tradeHistory.length,
            totalPnl: Number(this.tradeHistory.reduce((acc, t) => acc + (t.realizedPnl || 0), 0).toFixed(2))
        };
    }
}

module.exports = new MasterTrailingEngine();
