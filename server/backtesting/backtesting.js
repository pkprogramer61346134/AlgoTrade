/**
 * Standalone Simple Backtesting Engine (Direct Strategy Consensus Target vs SL Evaluation)
 * Location: C:\AlgoTrade\server\backtesting\backtesting.js
 * 
 * Features:
 * 1. Independent & Decoupled: Zero dependency on MasterSL.
 * 2. Real Cached Market Candles: Loaded via cached-historical-data.js.
 * 3. Strategy Evaluation: Calls evaluateConsensusEngine({ securityId, exchangeSegment, interval, date, time })
 *    passing ONLY date and time options (no candle arrays passed).
 * 4. Honest Point Evaluation:
 *    - BUY : SL Hit if candleLow <= SL | Target Hit if candleHigh >= Target | PnL = Exit - Entry
 *    - SELL: SL Hit if candleHigh >= SL | Target Hit if candleLow <= Target | PnL = Entry - Exit
 * 5. Intraday EOD Protection: Auto square-off at 15:15 PM.
 * 6. Generates clean backtest report with Winrate, PASS/LOSS count, Net Points, and Daily Breakdown.
 */

const fs = require('fs');
const path = require('path');
const { getCachedCandles } = require('../../utility/usedfull/cached-historical-data');
const { evaluateConsensusEngine } = require('../../utility/usedfull/Engines/consensusEngine');

const REPORT_FILE = path.join(__dirname, 'backtest_report.json');

class BacktestEngine {
    constructor() {
        this.report = null;
    }

    /**
     * Stream historical candles and evaluate direct Target vs SL performance
     */
    async streamHistoricalCandles(params = {}, onCandleTick = null) {
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const fromDate = params.fromDate || params.date || "2026-09-21";
        const toDate = params.toDate || params.date || todayStr;
        const interval = String(params.interval || "5");
        const maxTradesPerDay = Number(params.maxTradesPerDay || 3);

        console.log("==========================================================================");
        console.log(`🧪 [SIMPLE BACKTEST ENGINE] Streaming Candles (${fromDate} to ${toDate})`);
        console.log(` Config: Interval: ${interval}m, Max Trades/Day: ${maxTradesPerDay}`);
        console.log(" Standalone Target vs SL Evaluation | Calling evaluateConsensusEngine({ date, time })");
        console.log("==========================================================================\n");

        // 1. Fetch main date range candles
        const candleRes = await getCachedCandles({
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            fromDate: fromDate,
            toDate: toDate,
            interval: interval
        });

        const targetCandles = candleRes.data || [];
        if (targetCandles.length === 0) {
            console.warn(`⚠️ [BACKTEST ENGINE] No candles found for ${fromDate} to ${toDate}`);
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
                    trHits: 0,
                    slHits: 0,
                    eodExits: 0
                },
                dailyBreakdown: [],
                trades: []
            };
            this.report = emptyReport;
            this.saveReport(emptyReport);
            return { candles: [], report: emptyReport };
        }

        console.log(`✅ [BACKTEST ENGINE] Loaded ${targetCandles.length} target candles. Running consensus evaluation...\n`);

        let activePosition = null;
        const tradesHistory = [];
        const dailyTradeCountMap = {};

        for (let i = 0; i < targetCandles.length; i++) {
            const tick = targetCandles[i];
            const candleClose = Number(tick.close || tick.candleClose || tick.price || 0);
            const candleHigh = Number(tick.high || tick.candleHigh || candleClose);
            const candleLow = Number(tick.low || tick.candleLow || candleClose);

            let closedTradeThisTick = null;
            let consensusResult = { consensus: "NO_SIGNAL", reason: "NO_EVALUATION" };

            try {
                // 1. Process Active Position Exit Rules (Trailing SL vs Target vs EOD)
                if (activePosition) {
                    const isBUY = activePosition.type === "BUY";
                    const isLastCandleOfDay = (tick.time >= "15:15:00" || i === targetCandles.length - 1 || (i < targetCandles.length - 1 && targetCandles[i + 1].date !== tick.date));

                    // Dynamic 1-R Lag Trailing SL Update (Scratch Implementation matching MasterSL)
                    if (isBUY) {
                        if (candleHigh >= activePosition.tr1 && activePosition.entryPrice > activePosition.currentSl) {
                            activePosition.currentSl = activePosition.entryPrice;
                            activePosition.trailingStage = "TRAILED_COST_TO_COST";
                        }
                        if (candleHigh >= activePosition.tr2 && activePosition.tr1 > activePosition.currentSl) {
                            activePosition.currentSl = activePosition.tr1;
                            activePosition.trailingStage = "TRAILED_TR1";
                        }
                        if (candleHigh >= activePosition.tr3 && activePosition.tr2 > activePosition.currentSl) {
                            activePosition.currentSl = activePosition.tr2;
                            activePosition.trailingStage = "TRAILED_TR2";
                        }
                        if (candleHigh >= activePosition.tr4 && activePosition.tr3 > activePosition.currentSl) {
                            activePosition.currentSl = activePosition.tr3;
                            activePosition.trailingStage = "TRAILED_TR3";
                        }
                        if (candleHigh >= activePosition.tr5 && activePosition.tr4 > activePosition.currentSl) {
                            activePosition.currentSl = activePosition.tr4;
                            activePosition.trailingStage = "TRAILED_TR4";
                        }
                    } else { // SELL / PE
                        if (candleLow <= activePosition.tr1 && activePosition.entryPrice < activePosition.currentSl) {
                            activePosition.currentSl = activePosition.entryPrice;
                            activePosition.trailingStage = "TRAILED_COST_TO_COST";
                        }
                        if (candleLow <= activePosition.tr2 && activePosition.tr1 < activePosition.currentSl) {
                            activePosition.currentSl = activePosition.tr1;
                            activePosition.trailingStage = "TRAILED_TR1";
                        }
                        if (candleLow <= activePosition.tr3 && activePosition.tr2 < activePosition.currentSl) {
                            activePosition.currentSl = activePosition.tr2;
                            activePosition.trailingStage = "TRAILED_TR2";
                        }
                        if (candleLow <= activePosition.tr4 && activePosition.tr3 < activePosition.currentSl) {
                            activePosition.currentSl = activePosition.tr3;
                            activePosition.trailingStage = "TRAILED_TR3";
                        }
                        if (candleLow <= activePosition.tr5 && activePosition.tr4 < activePosition.currentSl) {
                            activePosition.currentSl = activePosition.tr4;
                            activePosition.trailingStage = "TRAILED_TR4";
                        }
                    }

                    // Evaluate Exits
                    let isTargetHit = false;
                    let isSLHit = false;
                    let isEODSquareOff = false;

                    if (isBUY) {
                        if (candleHigh >= activePosition.targetPrice) {
                            isTargetHit = true;
                        } else if (candleLow <= activePosition.currentSl) {
                            isSLHit = true;
                        } else if (isLastCandleOfDay) {
                            isEODSquareOff = true;
                        }
                    } else { // SELL / PE
                        if (candleLow <= activePosition.targetPrice) {
                            isTargetHit = true;
                        } else if (candleHigh >= activePosition.currentSl) {
                            isSLHit = true;
                        } else if (isLastCandleOfDay) {
                            isEODSquareOff = true;
                        }
                    }

                    if (isTargetHit || isSLHit || isEODSquareOff) {
                        const exitPrice = isTargetHit ? activePosition.targetPrice : (isSLHit ? activePosition.currentSl : candleClose);
                        const exitReason = isTargetHit ? "TARGET_HIT" : (isSLHit ? (activePosition.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${activePosition.trailingStage})`) : "EOD_SQUARE_OFF");
                        const pts = isBUY ? (exitPrice - activePosition.entryPrice) : (activePosition.entryPrice - exitPrice);
                        const pointsNum = Number(pts.toFixed(2));

                        closedTradeThisTick = {
                            tradeId: activePosition.tradeId,
                            strategyId: activePosition.strategyId,
                            strategyName: activePosition.strategyName,
                            type: activePosition.type,
                            optionType: activePosition.type === "BUY" ? "CE" : "PE",
                            entryDate: activePosition.entryDate,
                            entryTime: activePosition.entryTime,
                            entryPrice: activePosition.entryPrice,
                            initialSl: activePosition.initialSl,
                            exitSl: activePosition.currentSl,
                            trailingStage: activePosition.trailingStage,
                            sl: activePosition.currentSl,
                            tr: activePosition.targetPrice,
                            targetPrice: activePosition.targetPrice,
                            exitDate: tick.date,
                            exitTime: tick.time,
                            exitPrice: Number(exitPrice.toFixed(2)),
                            exitReason: exitReason,
                            points: pointsNum,
                            result: pointsNum >= 0 ? "PASS" : "LOSS"
                        };

                        tradesHistory.push(closedTradeThisTick);
                        activePosition = null;
                    }
                }

                // 2. Evaluate Strategy Signal via Consensus Engine (passing ONLY options object with date & time)
                const dayKey = tick.date || "DEFAULT";
                const currentDayTrades = dailyTradeCountMap[dayKey] || 0;

                consensusResult = await evaluateConsensusEngine({
                    securityId: "13",
                    exchangeSegment: "IDX_I",
                    interval: interval,
                    date: tick.date,
                    time: tick.time
                });

                // 3. Open New Position if no position active and valid signal triggered before 3:00 PM
                if (!activePosition && (consensusResult.consensus === "BUY" || consensusResult.consensus === "SELL")) {
                    if (consensusResult.sl && consensusResult.tr && tick.time <= "15:00:00" && currentDayTrades < maxTradesPerDay) {
                        dailyTradeCountMap[dayKey] = currentDayTrades + 1;

                        const entryPrice = Number((consensusResult.entry || candleClose).toFixed(2));
                        const initialSl = Number(consensusResult.sl.toFixed(2));
                        const riskPoints = Math.max(0.1, Number(Math.abs(entryPrice - initialSl).toFixed(2)));
                        const type = consensusResult.consensus;

                        let tr1, tr2, tr3, tr4, tr5;
                        if (type === "BUY") {
                            tr1 = Number((entryPrice + riskPoints * 1).toFixed(2));
                            tr2 = Number((entryPrice + riskPoints * 2).toFixed(2));
                            tr3 = Number((entryPrice + riskPoints * 3).toFixed(2));
                            tr4 = Number((entryPrice + riskPoints * 4).toFixed(2));
                            tr5 = Number((entryPrice + riskPoints * 5).toFixed(2));
                        } else {
                            tr1 = Number((entryPrice - riskPoints * 1).toFixed(2));
                            tr2 = Number((entryPrice - riskPoints * 2).toFixed(2));
                            tr3 = Number((entryPrice - riskPoints * 3).toFixed(2));
                            tr4 = Number((entryPrice - riskPoints * 4).toFixed(2));
                            tr5 = Number((entryPrice - riskPoints * 5).toFixed(2));
                        }

                        activePosition = {
                            tradeId: `BT_${i}_${Date.now()}`,
                            strategyId: consensusResult.strategyId || "STRAT_CONSENSUS",
                            strategyName: consensusResult.strategyName || "Consensus Engine Strategy",
                            type: type,
                            entryDate: tick.date,
                            entryTime: tick.time,
                            entryPrice: entryPrice,
                            initialSl: initialSl,
                            currentSl: initialSl,
                            targetPrice: Number(consensusResult.tr.toFixed(2)),
                            trailingStage: "INITIAL",
                            riskPoints: riskPoints,
                            tr1, tr2, tr3, tr4, tr5
                        };
                    }
                }

                // Progress callback for SSE Stream / Web Server
                if (typeof onCandleTick === 'function') {
                    await onCandleTick({
                        index: i + 1,
                        total: targetCandles.length,
                        percent: Math.round(((i + 1) / targetCandles.length) * 100),
                        tick: {
                            date: tick.date,
                            time: tick.time,
                            close: candleClose,
                            high: candleHigh,
                            low: candleLow
                        },
                        consensusResult: {
                            consensus: consensusResult?.consensus || "NO_SIGNAL",
                            reason: consensusResult?.reason || "WAITING"
                        },
                        activePosition: activePosition,
                        tradeCount: tradesHistory.length,
                        latestClosedTrade: closedTradeThisTick
                    });
                }

            } catch (err) {
                console.error("❌ Backtest Tick Error:", err.message);
            }
        }

        // Calculate final accurate performance metrics
        let totalPoints = 0;
        let grossWinPoints = 0;
        let grossLossPoints = 0;
        let trHitsCount = 0;
        let slHitsCount = 0;
        let eodCount = 0;

        const formattedTrades = tradesHistory.map(t => {
            const isWin = t.points >= 0;
            if (t.exitReason === "TARGET_HIT") trHitsCount++;
            else if (t.exitReason === "STOP_LOSS_HIT") slHitsCount++;
            else if (t.exitReason === "EOD_SQUARE_OFF") eodCount++;

            if (isWin) {
                grossWinPoints += t.points;
            } else {
                grossLossPoints += Math.abs(t.points);
            }
            totalPoints += t.points;

            return {
                ...t,
                initialSl: t.sl,
                targetPrice: t.tr,
                result: isWin ? "PASS" : "LOSS"
            };
        });

        const totalTrades = formattedTrades.length;
        const winningTradesCount = formattedTrades.filter(t => t.points >= 0).length;
        const losingTradesCount = formattedTrades.filter(t => t.points < 0).length;

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
                dailyMap[dayKey] = { date: dayKey, totalTrades: 0, winningTrades: 0, losingTrades: 0, trHits: 0, slHits: 0, netPoints: 0 };
            }
            dailyMap[dayKey].totalTrades += 1;
            dailyMap[dayKey].netPoints = Number((dailyMap[dayKey].netPoints + t.points).toFixed(2));
            if (t.points >= 0) dailyMap[dayKey].winningTrades += 1;
            else dailyMap[dayKey].losingTrades += 1;
            if (t.exitReason === "TARGET_HIT") dailyMap[dayKey].trHits += 1;
            if (t.exitReason === "STOP_LOSS_HIT") dailyMap[dayKey].slHits += 1;
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
            totalCandles: targetCandles.length,
            stats: {
                totalTrades,
                winningTrades: winningTradesCount,
                losingTrades: losingTradesCount,
                trHits: trHitsCount,
                slHits: slHitsCount,
                eodExits: eodCount,
                winrate: winrateStr,
                netPoints: netPointsFormatted,
                avgTradePoints: avgTradePointsFormatted,
                profitFactor: profitFactorStr,
                maxTradesPerDay
            },
            dailyBreakdown,
            trades: formattedTrades
        };

        this.report = completeReport;
        this.saveReport(completeReport);

        console.log("\n==========================================================================");
        console.log(`🎉 BACKTEST COMPLETE: Total Trades: ${totalTrades} | Wins: ${winningTradesCount} | Losses: ${losingTradesCount} | TR Hits: ${trHitsCount} | SL Hits: ${slHitsCount} | Winrate: ${winrateStr} | Net Pts: ${netPointsFormatted >= 0 ? '+' : ''}${netPointsFormatted}`);
        console.log("==========================================================================\n");

        return { candles: targetCandles, report: completeReport };
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
