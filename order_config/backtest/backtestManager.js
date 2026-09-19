/**
 * DEDICATED BACKTEST MANAGER MODULE
 * Location: C:\AlgoTrade\order_config\backtest\backtestManager.js
 * 
 * Executes high-conviction backtests on Dhan API real candle data using:
 * - CentralCandleDataHub
 * - Master Head Consensus Engine (16-Strategy Voting System)
 * - Institutional Liquidity Sweep & Zone Protection Strategy
 * - SpotRiskDeltaCalculator
 */

const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../../src/candleDataHub');
const { evaluateConsensusEngine } = require('../../src/consensusEngine');
const { prepareJSONStrategyData } = require('../../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../../src/spotRiskDeltaCalculator');

class BacktestManager {
    constructor() {
        this.hub = new CentralCandleDataHub();
        this.stratPath = path.join(__dirname, '../../strategies_config/consensus_master_head.json');
        if (fs.existsSync(this.stratPath)) {
            this.stratConfig = JSON.parse(fs.readFileSync(this.stratPath, 'utf8'));
        } else {
            this.stratConfig = {
                id: "consensus_master_head",
                riskRewardRatio: 2.0,
                maxTradesPerDay: 3,
                consensusThreshold: 13
            };
        }
    }

    async runBacktest(startDate = '2026-09-01', endDate = '2026-09-18', initialCapital = 100000) {
        let start = (startDate || '2026-09-01').trim();
        let end = (endDate || start).trim();

        // Fix invalid year (e.g. 0001-08-31 -> 2026-08-31)
        if (start.startsWith('0001') || (start.split('-')[0] && parseInt(start.split('-')[0], 10) < 2000)) {
            start = '2026' + start.substring(4);
        }
        if (end.startsWith('0001') || (end.split('-')[0] && parseInt(end.split('-')[0], 10) < 2000)) {
            end = '2026' + end.substring(4);
        }

        if (start > end) {
            const temp = start;
            start = end;
            end = temp;
        }

        const candles = await this.hub.getCandlesWithWarmup(start, end, 300);
        const preparedData = prepareJSONStrategyData(candles, this.stratConfig);
        const dailyTradeCounts = {};

        let capital = Number(initialCapital);
        const trades = [];
        let activeTrade = null;

        for (let i = 300; i < candles.length; i++) {
            const c = candles[i];
            if (c.date < start || c.date > end) continue;

            const timeStr = c.time || '09:15';
            const parts = timeStr.split(':').map(Number);
            const totalMins = parts[0] * 60 + (parts[1] || 0);

            // Active Position Monitor
            if (activeTrade) {
                const currentSpotPrice = c.close;
                const spotMove = currentSpotPrice - activeTrade.spotEntryPrice;
                const deltaMove = activeTrade.optionType === "CE" ? (spotMove * 0.50) : (-spotMove * 0.50);
                const currentOptionPremium = Math.max(0.5, Number((activeTrade.optionPremiumPrice + deltaMove).toFixed(2)));

                const dualExit = SpotRiskDeltaCalculator.evaluateDualLayerExit({
                    currentSpotPrice,
                    currentOptionPremium,
                    activePosition: activeTrade,
                    totalMins
                });

                if (dualExit.exitTriggered) {
                    const finalExitPremium = dualExit.exitPrice;
                    const ptsPnL = Number((finalExitPremium - activeTrade.optionPremiumPrice).toFixed(2));
                    const totalPnL = Number((ptsPnL * activeTrade.quantity).toFixed(2));
                    
                    capital = Number((capital + totalPnL).toFixed(2));

                    trades.push({
                        id: trades.length + 1,
                        date: c.date,
                        entryTime: activeTrade.entryTime,
                        exitTime: timeStr,
                        optionType: activeTrade.optionType,
                        spotEntryPrice: activeTrade.spotEntryPrice,
                        spotExitPrice: currentSpotPrice,
                        spotSL: activeTrade.spotSL,
                        spotTarget: activeTrade.spotTarget,
                        optionPremiumPrice: activeTrade.optionPremiumPrice,
                        exitPremiumPrice: finalExitPremium,
                        pnlRupees: totalPnL,
                        pnlPoints: ptsPnL,
                        exitReason: dualExit.exitReason,
                        balanceAfter: capital,
                        consensusVotes: activeTrade.consensusVotes
                    });

                    activeTrade = null;
                }
            }

            // Entry Signal Scanner
            if (!activeTrade && totalMins >= 555 && totalMins < 900) {
                const todayTrades = dailyTradeCounts[c.date] || 0;
                if (todayTrades < 3) {
                    const signal = evaluateConsensusEngine(candles, i, this.stratConfig, preparedData, dailyTradeCounts, false);
                    if (signal && signal.type !== "NONE") {
                        const spotPrice = c.close;
                        const optionType = signal.type === "BUY" ? "CE" : "PE";
                        const optionPremiumPrice = Math.max(20, Math.round(spotPrice * 0.005));
                        const qty = 65; // 1 Lot Nifty

                        const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
                            spotPrice,
                            signalType: signal.type,
                            stopLoss: signal.stopLoss,
                            targetPrice: signal.targetPrice,
                            riskRewardRatio: 2.0
                        });

                        const optionDeltaMap = SpotRiskDeltaCalculator.mapSpotToOptionDelta({
                            spotPrice,
                            spotSL: spotStruct.spotSL,
                            spotTarget: spotStruct.spotTarget,
                            optionPremiumPrice,
                            optionType,
                            maxRiskPtsCap: 100,
                            delta: 0.50
                        });

                        activeTrade = {
                            orderId: `BT_${trades.length + 1}`,
                            mode: "BACKTEST",
                            status: "ACTIVE",
                            date: c.date,
                            entryTime: timeStr,
                            optionType,
                            spotEntryPrice: spotPrice,
                            spotSL: spotStruct.spotSL,
                            spotTarget: spotStruct.spotTarget,
                            quantity: qty,
                            numLots: 1,
                            optionPremiumPrice,
                            currentPremium: optionPremiumPrice,
                            initialSL: optionDeltaMap.optionSL,
                            currentSL: optionDeltaMap.optionSL,
                            target: optionDeltaMap.optionTarget,
                            currentTarget: optionDeltaMap.optionTarget,
                            consensusVotes: signal.consensusVotes
                        };
                    }
                }
            }
        }

        let wins = 0;
        let losses = 0;
        trades.forEach(t => {
            if (t.pnlRupees > 0) wins++;
            else if (t.pnlRupees < 0) losses++;
        });

        const netPnL = Number((capital - initialCapital).toFixed(2));
        const netPnLPct = Number(((netPnL / initialCapital) * 100).toFixed(2));
        const winRate = trades.length > 0 ? Number(((wins / trades.length) * 100).toFixed(1)) : 0;

        return {
            startDate: start,
            endDate: end,
            initialCapital,
            finalCapital: capital,
            netPnL,
            netPnLPct,
            totalTrades: trades.length,
            wins,
            losses,
            winRate,
            trades
        };
    }
}

module.exports = BacktestManager;
