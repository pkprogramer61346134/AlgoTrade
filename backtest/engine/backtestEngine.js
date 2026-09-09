/**
 * Core Backtest Simulation Engine
 * Simulates trades, manages capital, computes Win Rate, Net PnL, Max Drawdown, and Risk-Reward Metrics
 */
class BacktestEngine {
    constructor(initialCapital = 100000, riskPerTradePct = 1.0) {
        this.initialCapital = initialCapital;
        this.capital = initialCapital;
        this.riskPerTradePct = riskPerTradePct;
        this.trades = [];
        this.activePosition = null;
        this.peakCapital = initialCapital;
        this.maxDrawdownPct = 0;
        this.equityCurve = [initialCapital];
    }

    executeTrade(signal, candle) {
        if (!signal || signal.type === "NONE") return;

        // Close active position if direction changes or SL/TP hit
        if (this.activePosition) {
            this.checkPositionExit(candle);
        }

        // Open new position if no active position
        if (!this.activePosition && (signal.type === "BUY" || signal.type === "SELL")) {
            const entryPrice = signal.entryPrice || candle.close;
            const stopLoss = signal.stopLoss;
            const targetPrice = signal.targetPrice;

            if (!stopLoss || !targetPrice) return;

            const riskPerShare = Math.abs(entryPrice - stopLoss);
            if (riskPerShare <= 0) return;

            const riskAmount = this.capital * (this.riskPerTradePct / 100);
            const quantity = Math.max(1, Math.floor(riskAmount / riskPerShare));

            this.activePosition = {
                id: this.trades.length + 1,
                type: signal.type,
                entryPrice,
                stopLoss,
                targetPrice,
                quantity,
                entryTime: candle.time,
                entryDate: candle.date,
                entryIndex: candle.index
            };
        }
    }

    checkPositionExit(candle) {
        if (!this.activePosition) return;

        const pos = this.activePosition;
        let exitPrice = null;
        let exitReason = null;

        if (pos.type === "BUY") {
            if (candle.low <= pos.stopLoss) {
                exitPrice = pos.stopLoss;
                exitReason = "STOP_LOSS";
            } else if (candle.high >= pos.targetPrice) {
                exitPrice = pos.targetPrice;
                exitReason = "TARGET_PROFIT";
            }
        } else if (pos.type === "SELL") {
            if (candle.high >= pos.stopLoss) {
                exitPrice = pos.stopLoss;
                exitReason = "STOP_LOSS";
            } else if (candle.low <= pos.targetPrice) {
                exitPrice = pos.targetPrice;
                exitReason = "TARGET_PROFIT";
            }
        }

        if (exitPrice !== null) {
            let pnl = 0;
            if (pos.type === "BUY") {
                pnl = (exitPrice - pos.entryPrice) * pos.quantity;
            } else {
                pnl = (pos.entryPrice - exitPrice) * pos.quantity;
            }

            this.capital += pnl;

            // Track Drawdown
            if (this.capital > this.peakCapital) {
                this.peakCapital = this.capital;
            }
            const currentDrawdown = ((this.peakCapital - this.capital) / this.peakCapital) * 100;
            if (currentDrawdown > this.maxDrawdownPct) {
                this.maxDrawdownPct = currentDrawdown;
            }

            this.trades.push({
                ...pos,
                exitPrice,
                exitTime: candle.time,
                exitDate: candle.date,
                exitReason,
                pnl: Number(pnl.toFixed(2)),
                capitalAfter: Number(this.capital.toFixed(2)),
                isWin: pnl > 0
            });

            this.equityCurve.push(Number(this.capital.toFixed(2)));
            this.activePosition = null;
        }
    }

    getReport(strategyName = "Strategy") {
        const totalTrades = this.trades.length;
        const winningTrades = this.trades.filter(t => t.isWin).length;
        const losingTrades = totalTrades - winningTrades;
        const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100) : 0;

        const totalProfit = this.trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
        const totalLoss = Math.abs(this.trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
        const netPnL = this.capital - this.initialCapital;
        const returnPct = (netPnL / this.initialCapital) * 100;
        const profitFactor = totalLoss > 0 ? (totalProfit / totalLoss) : (totalProfit > 0 ? Infinity : 0);

        return {
            strategyName,
            initialCapital: this.initialCapital,
            finalCapital: Number(this.capital.toFixed(2)),
            netPnL: Number(netPnL.toFixed(2)),
            returnPct: Number(returnPct.toFixed(2)),
            totalTrades,
            winningTrades,
            losingTrades,
            winRatePct: Number(winRate.toFixed(2)),
            maxDrawdownPct: Number(this.maxDrawdownPct.toFixed(2)),
            profitFactor: profitFactor === Infinity ? "Infinity" : Number(profitFactor.toFixed(2)),
            trades: this.trades
        };
    }
}

module.exports = BacktestEngine;
