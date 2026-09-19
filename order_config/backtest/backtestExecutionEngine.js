const path = require('path');
const fs = require('fs');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('../../src/dynamicStrategyEngine');

const CONFIG_FILE = path.join(__dirname, 'configBacktest.json');

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 555;
    const isPM = /pm/i.test(timeStr);
    const isAM = /am/i.test(timeStr);
    const cleanStr = timeStr.replace(/(am|pm)/i, '').trim();
    const parts = cleanStr.split(':').map(Number);
    let hh = parts[0] || 0;
    const mm = parts[1] || 0;

    if (isPM && hh < 12) hh += 12;
    if (isAM && hh === 12) hh = 0;

    return hh * 60 + mm;
}

class BacktestExecutionEngine {
    constructor(config = null) {
        this.config = config || this.loadDefaultConfig();
    }

    loadDefaultConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            }
        } catch (e) {}
        return {
            executionMode: "BACKTEST",
            initialCapital: 10000,
            riskRewardRatio: 3,
            riskManagement: { maxOpenPositions: 1, maxTradesPerDay: 3, maxLossPerTrade: 1000, maxLossPerDay: 5000 }
        };
    }

    runBacktest(candles, stratConfig, initialCapital = 100000, capitalUsagePct = 100, customQuantity = null) {
        if (!candles || candles.length === 0) {
            return {
                strategyName: stratConfig?.name || "Strategy",
                initialCapital: Number(initialCapital),
                finalCapital: Number(initialCapital),
                netPnL: 0,
                returnPct: 0,
                totalTrades: 0,
                winningTrades: 0,
                losingTrades: 0,
                winRate: 0,
                maxDrawdownPct: 0,
                profitFactor: 0,
                trades: [],
                equityCurve: []
            };
        }

        const data = prepareJSONStrategyData(candles, stratConfig);
        const trades = [];
        const dailyCounts = {};
        const dailyPnL = {};
        let capital = Number(initialCapital);
        const equityCurve = [{ date: candles[0]?.date || "2018-01-01", balance: capital }];

        let peakBalance = capital;
        let maxDrawdownPct = 0;
        let activeTrade = null;

        const NIFTY_LOT_SIZE = 65;
        const rrRatio = stratConfig?.riskRewardRatio || this.config?.paperTrading?.riskRewardRatio || this.config?.riskRewardRatio || 3.0;

        for (let i = 1; i < candles.length; i++) {
            const candle = candles[i];
            const dateStr = candle.date;
            const timeStr = candle.time || "09:15";
            const totalMins = parseTimeToMinutes(timeStr);

            if (!dailyCounts[dateStr]) dailyCounts[dateStr] = 0;
            if (dailyPnL[dateStr] === undefined) dailyPnL[dateStr] = 0;

            if (activeTrade) {
                const isBuy = activeTrade.signalType === "BUY";
                let spotHigh = candle.high;
                let spotLow = candle.low;

                // Dynamic Trailing SL to Breakeven (Cost) once trade moves +20 points in profit
                if (isBuy) {
                    const currentGain = spotHigh - activeTrade.spotEntryPrice;
                    if (currentGain >= 20.0 && activeTrade.slPrice < activeTrade.spotEntryPrice) {
                        activeTrade.slPrice = activeTrade.spotEntryPrice;
                        activeTrade.isBreakevenSet = true;
                    }
                } else {
                    const currentGain = activeTrade.spotEntryPrice - spotLow;
                    if (currentGain >= 20.0 && activeTrade.slPrice > activeTrade.spotEntryPrice) {
                        activeTrade.slPrice = activeTrade.spotEntryPrice;
                        activeTrade.isBreakevenSet = true;
                    }
                }

                let exitTriggered = false;
                let exitReason = "";
                let spotExitPrice = candle.close;

                if (totalMins >= 900) { // 3:00 PM Auto Square-Off
                    exitTriggered = true;
                    exitReason = "EOD_SQUAREOFF";
                    spotExitPrice = candle.close;
                } else if (isBuy) {
                    if (spotHigh >= activeTrade.targetPrice) {
                        exitTriggered = true;
                        exitReason = "TARGET_HIT";
                        spotExitPrice = activeTrade.targetPrice;
                    } else if (spotLow <= activeTrade.slPrice) {
                        exitTriggered = true;
                        exitReason = "SL_HIT";
                        spotExitPrice = activeTrade.slPrice;
                    }
                } else {
                    if (spotLow <= activeTrade.targetPrice) {
                        exitTriggered = true;
                        exitReason = "TARGET_HIT";
                        spotExitPrice = activeTrade.targetPrice;
                    } else if (spotHigh >= activeTrade.slPrice) {
                        exitTriggered = true;
                        exitReason = "SL_HIT";
                        spotExitPrice = activeTrade.slPrice;
                    }
                }

                if (exitTriggered) {
                    const pointsPnL = isBuy ?
                        Number((spotExitPrice - activeTrade.spotEntryPrice).toFixed(2)) :
                        Number((activeTrade.spotEntryPrice - spotExitPrice).toFixed(2));

                    const tradePnL = Number((pointsPnL * activeTrade.quantity).toFixed(2));

                    capital = Number((capital + tradePnL).toFixed(2));
                    dailyPnL[dateStr] += tradePnL;

                    if (capital > peakBalance) peakBalance = capital;
                    const dd = peakBalance > 0 ? ((peakBalance - capital) / peakBalance) * 100 : 0;
                    if (dd > maxDrawdownPct) maxDrawdownPct = dd;

                    let statusNote = "🕒 EOD CLOSE (SQUAREOFF)";
                    if (exitReason === "TARGET_HIT") {
                        statusNote = "🎯 TARGET HIT (SUCCESS)";
                    } else if (exitReason === "SL_HIT") {
                        statusNote = activeTrade.isBreakevenSet ? "🛡️ BREAKEVEN COST SL HIT (0 LOSS)" : "🛑 STOP LOSS HIT";
                    } else if (exitReason === "EOD_SQUAREOFF") {
                        statusNote = pointsPnL > 0 ? "🕒 EOD CLOSE (SUCCESS PROFIT)" : "🕒 EOD CLOSE (SQUAREOFF)";
                    }

                    equityCurve.push({ date: dateStr, time: timeStr, balance: capital });

                    trades.push({
                        id: trades.length + 1,
                        date: dateStr,
                        time: activeTrade.entryTime,
                        entryTime: activeTrade.entryTime,
                        exitTime: timeStr,
                        type: activeTrade.signalType,
                        symbol: "NIFTY 50",
                        optionSymbol: `NIFTY 50 (${activeTrade.signalType})`,
                        spotEntryPrice: Number(activeTrade.spotEntryPrice.toFixed(2)),
                        spotPrice: Number(activeTrade.spotEntryPrice.toFixed(2)),
                        spotExitPrice: Number(spotExitPrice.toFixed(2)),
                        entryPremium: Number(activeTrade.spotEntryPrice.toFixed(2)),
                        slPrice: Number(activeTrade.slPrice.toFixed(2)),
                        optionSL: Number(activeTrade.slPrice.toFixed(2)),
                        targetPrice: Number(activeTrade.targetPrice.toFixed(2)),
                        target: Number(activeTrade.targetPrice.toFixed(2)),
                        optionTarget: Number(activeTrade.targetPrice.toFixed(2)),
                        riskRewardRatio: rrRatio,
                        quantity: activeTrade.quantity,
                        numLots: activeTrade.numLots,
                        pointsPnL: pointsPnL,
                        pnl: tradePnL,
                        balanceAfter: capital,
                        result: exitReason,
                        statusNote: statusNote
                    });

                    activeTrade = null;
                }
            }

            if (!activeTrade) {
                // Pure backtest execution (before 3:00 PM cutoff, ignoring artificial daily trade/loss caps)
                if (totalMins < 900) {
                    const evalResult = evaluateJSONStrategy(candles, i, stratConfig, data, dailyCounts, true);
                    const sig = evalResult?.signal || evalResult?.type;
                    if (evalResult && (sig === "BUY_SIGNAL" || sig === "BUY" || sig === "SELL_SIGNAL" || sig === "SELL")) {
                        const signalType = (sig === "BUY_SIGNAL" || sig === "BUY") ? "BUY" : "SELL";
                        const spotPrice = candle.close;

                        let slPoints = 20.0;
                        if (evalResult.stopLoss) {
                            const slVal = Number(evalResult.stopLoss);
                            if (signalType === "BUY") {
                                slPoints = Math.max(5, spotPrice - slVal);
                            } else {
                                slPoints = Math.max(5, slVal - spotPrice);
                            }
                        }

                        let quantity = customQuantity || stratConfig?.defaultQuantity || NIFTY_LOT_SIZE;
                        const numLots = Math.max(1, Math.floor(quantity / NIFTY_LOT_SIZE));

                        const targetPoints = Number((slPoints * rrRatio).toFixed(2));
                        let slPrice = 0;
                        let targetPrice = 0;

                        if (signalType === "BUY") {
                            slPrice = Number((spotPrice - slPoints).toFixed(2));
                            targetPrice = Number((spotPrice + targetPoints).toFixed(2));
                        } else {
                            slPrice = Number((spotPrice + slPoints).toFixed(2));
                            targetPrice = Number((spotPrice - targetPoints).toFixed(2));
                        }

                        activeTrade = {
                            signalType,
                            symbol: "NIFTY 50",
                            spotEntryPrice: spotPrice,
                            slPoints,
                            slPrice,
                            targetPrice,
                            quantity,
                            numLots,
                            entryTime: timeStr
                        };

                        dailyCounts[dateStr]++;
                    }
                }
            }
        }

        const winningTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl <= 0);
        const totalWinPnL = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
        const totalLossPnL = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

        const netPnL = Number((capital - initialCapital).toFixed(2));
        const returnPct = initialCapital > 0 ? Number(((netPnL / initialCapital) * 100).toFixed(2)) : 0;
        const winRate = trades.length > 0 ? Number(((winningTrades.length / trades.length) * 100).toFixed(2)) : 0;
        const profitFactor = totalLossPnL > 0 ? Number((totalWinPnL / totalLossPnL).toFixed(2)) : (totalWinPnL > 0 ? 999 : 0);

        return {
            strategyName: stratConfig?.name || "Strategy",
            initialCapital: Number(initialCapital),
            finalCapital: capital,
            netPnL,
            returnPct,
            totalTrades: trades.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate,
            maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
            profitFactor,
            trades,
            equityCurve
        };
    }
}

module.exports = BacktestExecutionEngine;
