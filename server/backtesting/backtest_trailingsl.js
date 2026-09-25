/**
 * Backtest Trailing Stop Loss & Execution Engine
 * Location: C:\AlgoTrade\server\backtesting\backtest_trailingsl.js
 * 
 * Features:
 * 1. Tracks active position state for backtesting simulations.
 * 2. Guard Check: If an active trade is OPEN, blocks/ignores any new Consensus Head signals.
 * 3. On confirmed BUY/SELL signal: Calculates 4-stage TR levels (TR1 1:1, TR2 1:2, TR3 1:3, TR4 1:4) and Initial SL.
 * 4. Process Candle Tick: Evaluates tick high/low to dynamically trail SL (Cost-to-Cost, TR1, TR2) or exit on TR4 / Trailed SL.
 * 5. On trade exit: Clears active position so the next signal can take a new trade.
 * 6. Maintains complete trade audit history and performance stats.
 */

const fs = require('fs');
const path = require('path');

class BacktestTrailingSLEngine {
    constructor() {
        this.activePosition = null;
        this.tradeHistory = [];
        this.lotSize = 65; // Default NIFTY Lot Size
        this.maxTradesPerDay = 3; // Default Max Trades Per Day
        this.targetMode = "TRAILING"; // Default Mode: TRAILING (Supports: "1:1", "1:2", "1:3", "1:4", "TRAILING")
        this.maxLossPerTrade = 300; // Max ₹ Loss Per Trade (Default: ₹300)
    }

    /**
     * Reset Backtest Engine State
     */
    resetEngine() {
        this.activePosition = null;
        this.tradeHistory = [];
    }

    /**
     * Process Consensus Head Signal
     * 
     * @param {Object} consensusResult - Evaluated signal from consensusEngine.js
     * @param {Object} tick - Current candle tick object { date, time, close, high, low, price }
     * @returns {Object|null} Active position or null if ignored
     */
    processSignal(consensusResult, tick) {
        if (!consensusResult || !tick) return null;

        // 1. Guard Check: If trade is ALREADY OPEN, ignore/block new signals
        if (this.activePosition && this.activePosition.status === "OPEN") {
            return { status: "IGNORED", reason: "POSITION_ALREADY_OPEN" };
        }

        // 2. Guard Check: Max Trades Per Day Limit Check (Max 3 Trades Per Day)
        const todayDate = tick.date || '';
        const todayTradesCount = this.tradeHistory.filter(t => (t.entryDate === todayDate)).length;
        if (todayTradesCount >= this.maxTradesPerDay) {
            return { status: "IGNORED", reason: `MAX_DAILY_TRADES_REACHED (${this.maxTradesPerDay})` };
        }

        // 3. If BUY or SELL signal is confirmed
        if (consensusResult.consensus === "BUY" || consensusResult.consensus === "SELL") {
            const optionType = consensusResult.consensus === "BUY" ? "CE" : "PE";
            const entryPrice = Number(consensusResult.entry || tick.price || tick.close || 0);

            let initialSl;
            let riskPoints;

            if (this.maxLossPerTrade && Number(this.maxLossPerTrade) > 0) {
                // Fixed Max Loss per trade in rupees (e.g. ₹200, ₹300)
                const maxLossRupees = Number(this.maxLossPerTrade);
                const totalQty = Math.max(1, this.lotSize || 65);
                riskPoints = Number((maxLossRupees / totalQty).toFixed(2));
                if (optionType === "CE") {
                    initialSl = Number((entryPrice - riskPoints).toFixed(2));
                } else {
                    initialSl = Number((entryPrice + riskPoints).toFixed(2));
                }
            } else {
                initialSl = Number(consensusResult.sl || (optionType === "CE" ? entryPrice - 25 : entryPrice + 25));
                riskPoints = Math.abs(entryPrice - initialSl);
            }

            // Dynamic Targets calculation: TR1 (1:1), TR2 (1:2), TR3 (1:3), TR4 (1:4 Target)
            let tr1, tr2, tr3, tr4;
            if (optionType === "CE") {
                tr1 = Number((entryPrice + (riskPoints * 1)).toFixed(2));
                tr2 = Number((entryPrice + (riskPoints * 2)).toFixed(2));
                tr3 = Number((entryPrice + (riskPoints * 3)).toFixed(2));
                tr4 = Number((entryPrice + (riskPoints * 4)).toFixed(2));
            } else {
                tr1 = Number((entryPrice - (riskPoints * 1)).toFixed(2));
                tr2 = Number((entryPrice - (riskPoints * 2)).toFixed(2));
                tr3 = Number((entryPrice - (riskPoints * 3)).toFixed(2));
                tr4 = Number((entryPrice - (riskPoints * 4)).toFixed(2));
            }

            const tr1Midway = Number((tr1 + ((tr2 - tr1) / 2)).toFixed(2));
            const tr2Midway = Number((tr2 + ((tr3 - tr2) / 2)).toFixed(2));

            // Determine Target Price based on configured targetMode ("1:1", "1:2", "1:3", "1:4", "TRAILING")
            const mode = String(this.targetMode || "TRAILING").toUpperCase();
            let targetPrice = tr4;
            let targetLabel = "TR4 (1:4)";

            if (mode.includes("1:1")) {
                targetPrice = tr1;
                targetLabel = "TR1 (1:1)";
            } else if (mode.includes("1:2")) {
                targetPrice = tr2;
                targetLabel = "TR2 (1:2)";
            } else if (mode.includes("1:3")) {
                targetPrice = tr3;
                targetLabel = "TR3 (1:3)";
            } else if (mode.includes("1:4")) {
                targetPrice = tr4;
                targetLabel = "TR4 (1:4)";
            }

            this.activePosition = {
                tradeId: "BT_TRAIL_" + (this.tradeHistory.length + 1),
                symbol: `NIFTY_${optionType}`,
                optionType: optionType,
                entryDate: tick.date || '',
                entryTime: tick.time || '',
                entryPrice: entryPrice,
                currentSl: initialSl,
                initialSl: initialSl,
                targetPrice: targetPrice,
                targetLabel: targetLabel,
                targetTr4: tr4,
                targetMode: mode,
                qty: this.lotSize,
                levels: {
                    initialSl,
                    tr1,
                    tr1Midway,
                    tr2,
                    tr2Midway,
                    tr3,
                    tr4
                },
                trailingStage: "INITIAL",
                strategyName: consensusResult.strategyName || "Consensus Head",
                status: "OPEN"
            };

            console.log(`\n🎯 [BACKTEST ENTRY] ${tick.date} ${tick.time} | Signal: ${consensusResult.consensus} | Mode: ${mode} | Entry: ₹${entryPrice} | SL: ₹${initialSl} | Target (${targetLabel}): ₹${targetPrice}`);
            return { status: "EXECUTED", position: this.activePosition };
        }

        return null;
    }

    /**
     * Process Candle Tick: Evaluates Trailing SL Rules & Exit Conditions
     * 
     * @param {Object} tick - Current candle tick object { date, time, high, low, close, price }
     * @returns {Object|null} Closed position if exited, otherwise active position
     */
    processTick(tick) {
        if (!this.activePosition || this.activePosition.status !== "OPEN" || !tick) return null;

        const pos = this.activePosition;
        const lvls = pos.levels;
        const buffer = 0.50; // Breathing room buffer
        const candleHigh = Number(tick.candleHigh || tick.high || tick.close || tick.price);
        const candleLow = Number(tick.candleLow || tick.low || tick.close || tick.price);

        let exitTriggered = false;
        let exitPrice = 0;
        let exitReason = "";

        const mode = String(this.targetMode || pos.targetMode || "TRAILING").toUpperCase();
        const isTrailingEnabled = mode.includes("TRAIL");

        if (!isTrailingEnabled) {
            // FIXED RISK-REWARD TARGET & SL MODE (NO TRAILING SL!)
            if (pos.optionType === "CE") {
                if (candleHigh >= pos.targetPrice) {
                    exitTriggered = true;
                    exitPrice = pos.targetPrice;
                    exitReason = `TARGET_HIT (${pos.targetLabel})`;
                } else if (candleLow <= pos.initialSl) {
                    exitTriggered = true;
                    exitPrice = pos.initialSl;
                    exitReason = "INITIAL_SL_HIT";
                }
            } else if (pos.optionType === "PE") {
                if (candleLow <= pos.targetPrice) {
                    exitTriggered = true;
                    exitPrice = pos.targetPrice;
                    exitReason = `TARGET_HIT (${pos.targetLabel})`;
                } else if (candleHigh >= pos.initialSl) {
                    exitTriggered = true;
                    exitPrice = pos.initialSl;
                    exitReason = "INITIAL_SL_HIT";
                }
            }
        } else {
            // DYNAMIC 4-STAGE TRAILING SL MODE
            if (pos.optionType === "CE") {
                // 1. Dynamic Trailing SL Adjustments for BUY (CE)
                if (candleHigh >= lvls.tr1 && pos.trailingStage === "INITIAL") {
                    const targetSl = Math.max(pos.currentSl, pos.entryPrice);
                    if (targetSl > pos.currentSl) {
                        pos.currentSl = targetSl;
                        pos.trailingStage = "TRAILED_COST_TO_COST";
                        console.log(`🔄 [BACKTEST TRAIL SL] TR1 (1:1) Hit! SL trailed to Cost-to-Cost: ₹${pos.currentSl}`);
                    }
                }
                if (candleHigh >= lvls.tr1Midway && pos.trailingStage === "TRAILED_COST_TO_COST") {
                    const targetSl = Number((lvls.tr1 - buffer).toFixed(2));
                    if (targetSl > pos.currentSl) {
                        pos.currentSl = targetSl;
                        pos.trailingStage = "TRAILED_TR1_MIDWAY";
                    }
                }
                if (candleHigh >= lvls.tr2 && (pos.trailingStage === "TRAILED_COST_TO_COST" || pos.trailingStage === "TRAILED_TR1_MIDWAY")) {
                    if (lvls.tr1 > pos.currentSl) {
                        pos.currentSl = lvls.tr1;
                        pos.trailingStage = "TRAILED_TR1";
                        console.log(`🔄 [BACKTEST TRAIL SL] TR2 (1:2) Hit! SL trailed to TR1: ₹${pos.currentSl}`);
                    }
                }
                if (candleHigh >= lvls.tr2Midway && pos.trailingStage === "TRAILED_TR1") {
                    const targetSl = Number((lvls.tr2 - buffer).toFixed(2));
                    if (targetSl > pos.currentSl) {
                        pos.currentSl = targetSl;
                        pos.trailingStage = "TRAILED_TR2_MIDWAY";
                    }
                }
                if (candleHigh >= lvls.tr3 && (pos.trailingStage === "TRAILED_TR1" || pos.trailingStage === "TRAILED_TR2_MIDWAY")) {
                    if (lvls.tr2 > pos.currentSl) {
                        pos.currentSl = lvls.tr2;
                        pos.trailingStage = "TRAILED_TR2";
                        console.log(`🔄 [BACKTEST TRAIL SL] TR3 (1:3) Hit! SL trailed to TR2: ₹${pos.currentSl}`);
                    }
                }

                // 2. Check Exits for BUY (CE)
                if (candleHigh >= lvls.tr4) {
                    exitTriggered = true;
                    exitPrice = lvls.tr4;
                    exitReason = "TR4_TARGET_HIT (1:4)";
                } else if (candleLow <= pos.currentSl) {
                    exitTriggered = true;
                    exitPrice = pos.currentSl;
                    exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                }

            } else if (pos.optionType === "PE") {
                // 1. Dynamic Trailing SL Adjustments for SELL (PE)
                if (candleLow <= lvls.tr1 && pos.trailingStage === "INITIAL") {
                    const targetSl = Math.min(pos.currentSl, pos.entryPrice);
                    if (targetSl < pos.currentSl) {
                        pos.currentSl = targetSl;
                        pos.trailingStage = "TRAILED_COST_TO_COST";
                        console.log(`🔄 [BACKTEST TRAIL SL] TR1 (1:1) Hit! SL trailed to Cost-to-Cost: ₹${pos.currentSl}`);
                    }
                }
                if (candleLow <= lvls.tr1Midway && pos.trailingStage === "TRAILED_COST_TO_COST") {
                    const targetSl = Number((lvls.tr1 + buffer).toFixed(2));
                    if (targetSl < pos.currentSl) {
                        pos.currentSl = targetSl;
                        pos.trailingStage = "TRAILED_TR1_MIDWAY";
                    }
                }
                if (candleLow <= lvls.tr2 && (pos.trailingStage === "TRAILED_COST_TO_COST" || pos.trailingStage === "TRAILED_TR1_MIDWAY")) {
                    if (lvls.tr1 < pos.currentSl) {
                        pos.currentSl = lvls.tr1;
                        pos.trailingStage = "TRAILED_TR1";
                        console.log(`🔄 [BACKTEST TRAIL SL] TR2 (1:2) Hit! SL trailed to TR1: ₹${pos.currentSl}`);
                    }
                }
                if (candleLow <= lvls.tr2Midway && pos.trailingStage === "TRAILED_TR1") {
                    const targetSl = Number((lvls.tr2 + buffer).toFixed(2));
                    if (targetSl < pos.currentSl) {
                        pos.currentSl = targetSl;
                        pos.trailingStage = "TRAILED_TR2_MIDWAY";
                    }
                }
                if (candleLow <= lvls.tr3 && (pos.trailingStage === "TRAILED_TR1" || pos.trailingStage === "TRAILED_TR2_MIDWAY")) {
                    if (lvls.tr2 < pos.currentSl) {
                        pos.currentSl = lvls.tr2;
                        pos.trailingStage = "TRAILED_TR2";
                        console.log(`🔄 [BACKTEST TRAIL SL] TR3 (1:3) Hit! SL trailed to TR2: ₹${pos.currentSl}`);
                    }
                }

                // 2. Check Exits for SELL (PE)
                if (candleLow <= lvls.tr4) {
                    exitTriggered = true;
                    exitPrice = lvls.tr4;
                    exitReason = "TR4_TARGET_HIT (1:4)";
                } else if (candleHigh >= pos.currentSl) {
                    exitTriggered = true;
                    exitPrice = pos.currentSl;
                    exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                }
            }
        }

        // If trade exit condition is triggered
        if (exitTriggered) {
            const pnlPts = pos.optionType === "CE" ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice);
            const realizedPnl = Number((pnlPts * pos.qty).toFixed(2));

            pos.status = "CLOSED";
            pos.exitDate = tick.date || '';
            pos.exitTime = tick.time || '';
            pos.exitPrice = exitPrice;
            pos.exitReason = exitReason;
            pos.realizedPnl = realizedPnl;

            this.tradeHistory.push(pos);
            this.activePosition = null; // Reset active position to allow next trade!

            console.log(`🏁 [BACKTEST EXIT] ${pos.symbol} | Exit Reason: ${exitReason} | Exit Price: ₹${exitPrice} | PnL: ₹${realizedPnl}`);
            return pos;
        }

        return this.activePosition;
    }

    /**
     * Force close any remaining open position (e.g. End of Day)
     */
    forceClosePosition(lastTick) {
        if (this.activePosition && this.activePosition.status === "OPEN") {
            const pos = this.activePosition;
            pos.status = "CLOSED";
            pos.exitDate = lastTick?.date || '';
            pos.exitTime = lastTick?.time || '';
            pos.exitPrice = pos.entryPrice;
            pos.exitReason = "EOD_FORCE_CLOSE";
            pos.realizedPnl = 0;
            this.tradeHistory.push(pos);
            this.activePosition = null;
        }
    }

    /**
     * Get Engine Summary & History Payload
     */
    getStatus() {
        const totalTrades = this.tradeHistory.length;
        const winningTrades = this.tradeHistory.filter(t => t.realizedPnl > 0).length;
        const losingTrades = this.tradeHistory.filter(t => t.realizedPnl < 0).length;
        const totalPnl = Number(this.tradeHistory.reduce((acc, t) => acc + (t.realizedPnl || 0), 0).toFixed(2));
        const winrate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) + "%" : "0%";

        return {
            activePosition: this.activePosition,
            history: this.tradeHistory,
            totalTrades,
            winningTrades,
            losingTrades,
            totalPnl,
            winrate
        };
    }
}

module.exports = new BacktestTrailingSLEngine();
