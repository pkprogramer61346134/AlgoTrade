/**
 * Backtesting Historical Data Streamer Engine & Trailing SL Simulator
 * Location: C:\AlgoTrade\server\backtesting\backtesting.js
 * 
 * Features:
 * Uses cached-historical-data.js to load NIFTY candles.
 * Evaluates consensusEngine.js and simulates trailing SL trades via Centralized MasterSL (C:\AlgoTrade\server\masterSL\masterSL.js).
 * Pure Trade-Based & Points-Based Evaluation (Zero Currency/Rupees dependency).
 */

const fs = require('fs');
const path = require('path');
const { getCachedCandles } = require('../../utility/usedfull/cached-historical-data');
const { evaluateConsensusEngine } = require('../../utility/usedfull/Engines/consensusEngine');
const masterSL = require('../masterSL/masterSL');
const masterConfig = require('../masterSL/config');

const REPORT_FILE = path.join(__dirname, 'backtest_report.json');

class BacktestEngine {
    constructor() {
        this.report = null;
    }

    /**
     * Get Backtesting Handlers for MasterSL Engine
     */
    getBacktestHandlers() {
        return {
            checkBalance: async () => 1000000, // Virtual Backtest Initial Balance (₹10,00,000)
            selectStrike: async (spotPrice, optionType) => {
                return {
                    symbol: `NIFTY_${optionType}`,
                    ltp: spotPrice,
                    lotSize: 65
                };
            },
            placeOrder: async (orderDetails) => {
                return { status: "SUCCESS", orderId: orderDetails.tradeId };
            },
            modifyOrder: async (orderId, newSl, stage) => true,
            closeOrder: async (position) => true
        };
    }

    /**
     * Stream historical candles and execute backtest via MasterSL
     */
    async streamHistoricalCandles(params = {}, onCandleTick = null) {
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const fromDate = params.fromDate || "2026-09-21";
        const toDate = params.toDate || todayStr;
        const interval = String(params.interval || "5");
        const maxTradesPerDay = Number(params.maxTradesPerDay || 3);
        const targetMode = String(params.targetMode || "TRAILING").toUpperCase();

        console.log("==========================================================================");
        console.log(`🧪 [BACKTEST ENGINE] Running NIFTY Backtest via MasterSL (${fromDate} to ${toDate})`);
        console.log(` Config: Interval: ${interval}m, Max Trades/Day: ${maxTradesPerDay}, Target Mode: ${targetMode}`);
        console.log(" Pure Trades & Points Evaluation (No Currency / ₹)");
        console.log("==========================================================================\n");

        // Save backtest specific config into MasterSL Config
        masterConfig.saveConfig({
            targetMode,
            maxTradesPerDay
        });

        // Reset MasterSL Engine state
        masterSL.activePosition = null;
        masterSL.tradeHistory = [];

        const backtestHandlers = this.getBacktestHandlers();

        // Fetch cached candles via cached-historical-data.js
        const candleRes = await getCachedCandles({
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            fromDate: fromDate,
            toDate: toDate,
            interval: interval
        });

        const candles = candleRes.data || [];
        if (candles.length === 0) {
            console.warn(`⚠️ [HISTORICAL STREAMER] No candles found for ${fromDate} to ${toDate}`);
            const emptyReport = {
                status: "success",
                symbol: "NIFTY",
                fromDate,
                toDate,
                interval: `${interval}m`,
                totalCandles: 0,
                stats: {
                    totalTrades: 0,
                    winningTrades: 0,
                    losingTrades: 0,
                    winrate: "0%",
                    netPoints: 0,
                    avgTradePoints: 0,
                    profitFactor: "0.00",
                    targetMode
                },
                dailyBreakdown: [],
                trades: []
            };
            this.report = emptyReport;
            this.saveReport(emptyReport);
            return { candles: [], report: emptyReport };
        }

        console.log(`✅ [HISTORICAL STREAMER] Loaded ${candles.length} candles. Evaluating candle-by-candle...\n`);

        let prevTradeCount = 0;

        // Process tick-by-tick
        for (let i = 0; i < candles.length; i++) {
            const tick = candles[i];
            tick.price = Number(tick.close || tick.candleClose || tick.price || 0);

            try {


                const consensusResult = await evaluateConsensusEngine(tick, -1, {
                    securityId: "13",
                    exchangeSegment: "IDX_I",
                    interval: interval
                });

                // 2. Evaluate open trade Trailing SL & Exit conditions via MasterSL
                const closedPos = await masterSL.processTick(tick, "BACKTEST");

                // 3. Process signal in MasterSL Engine (Blocks new signal if trade is ALREADY OPEN!)
                consensusResult.date = tick.date;
                consensusResult.time = tick.time;
                await masterSL.processSignal(consensusResult, backtestHandlers, "BACKTEST");

                const currentStatus = masterSL.getStatus();
                const newTradeTriggered = currentStatus.history.length > prevTradeCount;
                if (newTradeTriggered) {
                    prevTradeCount = currentStatus.history.length;
                }

                if (typeof onCandleTick === 'function') {
                    await onCandleTick({
                        index: i + 1,
                        total: candles.length,
                        percent: Math.round(((i + 1) / candles.length) * 100),
                        tick: {
                            date: tick.date,
                            time: tick.time,
                            close: tick.price,
                            high: tick.high,
                            low: tick.low
                        },
                        consensusResult: {
                            consensus: consensusResult.consensus,
                            reason: consensusResult.reason
                        },
                        activePosition: currentStatus.activePosition,
                        tradeCount: currentStatus.history.length,
                        latestClosedTrade: closedPos && closedPos.status === "CLOSED" ? closedPos : null
                    });
                }

            } catch (err) {
                console.error("❌ Consensus Engine Error:", err.message);
            }
        }

        // -------------------------------------------------------------
        // CALCULATE PURE TRADE & POINTS STATS (NO RUPEES / CURRENCY)
        // -------------------------------------------------------------
        const status = masterSL.getStatus();
        const tradesList = status.history;

        let totalPoints = 0;
        let grossWinPoints = 0;
        let grossLossPoints = 0;
        let winningTradesCount = 0;
        let losingTradesCount = 0;

        const formattedTrades = tradesList.map(t => {
            const isCE = t.optionType === "CE";
            const pts = isCE ? (t.exitPrice - t.entryPrice) : (t.entryPrice - t.exitPrice);
            const pointsNum = Number(pts.toFixed(2));
            const isPass = pointsNum > 0;

            if (isPass) {
                winningTradesCount++;
                grossWinPoints += pointsNum;
            } else if (pointsNum < 0) {
                losingTradesCount++;
                grossLossPoints += Math.abs(pointsNum);
            }
            totalPoints += pointsNum;

            return {
                tradeId: t.tradeId,
                entryDate: t.entryDate,
                entryTime: t.entryTime,
                optionType: t.optionType,
                entryPrice: Number(t.entryPrice.toFixed(2)),
                initialSl: Number(t.initialSl.toFixed(2)),
                targetPrice: Number((t.targetPrice || t.levels?.tr4 || t.levels?.tr5 || 0).toFixed(2)),
                exitDate: t.exitDate || t.entryDate,
                exitTime: t.exitTime || t.entryTime,
                exitPrice: Number(t.exitPrice.toFixed(2)),
                exitReason: t.exitReason,
                points: pointsNum,
                result: isPass ? "PASS" : (pointsNum < 0 ? "LOSS" : "NEUTRAL")
            };
        });

        const totalTrades = formattedTrades.length;
        const winrateNum = totalTrades > 0 ? ((winningTradesCount / totalTrades) * 100) : 0;
        const winrateStr = `${winrateNum.toFixed(1)}%`;
        const netPointsFormatted = Number(totalPoints.toFixed(2));
        const avgTradePointsFormatted = totalTrades > 0 ? Number((totalPoints / totalTrades).toFixed(2)) : 0;
        const profitFactorStr = grossLossPoints > 0 ? (grossWinPoints / grossLossPoints).toFixed(2) : (grossWinPoints > 0 ? "99.00" : "0.00");

        // Daily Trade Breakdown
        const dailyMap = {};
        formattedTrades.forEach(t => {
            const dayKey = t.exitDate || t.entryDate || "Unknown";
            if (!dailyMap[dayKey]) {
                dailyMap[dayKey] = { date: dayKey, totalTrades: 0, winningTrades: 0, losingTrades: 0, netPoints: 0 };
            }
            dailyMap[dayKey].totalTrades += 1;
            dailyMap[dayKey].netPoints = Number((dailyMap[dayKey].netPoints + t.points).toFixed(2));
            if (t.result === "PASS") dailyMap[dayKey].winningTrades += 1;
            if (t.result === "LOSS") dailyMap[dayKey].losingTrades += 1;
        });

        const dailyBreakdown = Object.values(dailyMap).map(d => ({
            ...d,
            winrate: d.totalTrades > 0 ? `${((d.winningTrades / d.totalTrades) * 100).toFixed(0)}%` : "0%"
        }));

        const completeReport = {
            status: "success",
            symbol: "NIFTY",
            fromDate,
            toDate,
            interval: `${interval}m`,
            totalCandles: candles.length,
            stats: {
                totalTrades,
                winningTrades: winningTradesCount,
                losingTrades: losingTradesCount,
                winrate: winrateStr,
                netPoints: netPointsFormatted,
                avgTradePoints: avgTradePointsFormatted,
                profitFactor: profitFactorStr,
                maxTradesPerDay,
                targetMode
            },
            dailyBreakdown,
            trades: formattedTrades
        };

        this.report = completeReport;
        this.saveReport(completeReport);
        return { candles, report: completeReport };
    }

    /**
     * Save Backtest Report to JSON File
     */
    saveReport(report) {
        try {
            fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf-8');
            return true;
        } catch (err) {
            console.error("❌ Error saving backtest report:", err.message);
            return false;
        }
    }

    /**
     * Get Last Generated Report
     */
    getReport() {
        if (this.report) return this.report;
        try {
            if (fs.existsSync(REPORT_FILE)) {
                const data = fs.readFileSync(REPORT_FILE, 'utf-8');
                this.report = JSON.parse(data);
                return this.report;
            }
        } catch (err) {
            console.error("❌ Error reading cached backtest report:", err.message);
        }
        return null;
    }

    /**
     * Runner helper
     */
    async runBacktest(params = {}) {
        const result = await this.streamHistoricalCandles(params);
        return result.report;
    }
}

module.exports = new BacktestEngine();
