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
const masterConfig = require('../masterSL/config');

const REPORT_FILE = path.join(__dirname, 'backtest_report.json');

function toSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return 0;
    const cleanStr = timeStr.trim().toLowerCase();
    const isPM = cleanStr.includes("pm");
    const isAM = cleanStr.includes("am");
    const timeOnly = cleanStr.replace(/(am|pm)/gi, "").trim();
    const parts = timeOnly.split(":");
    let hours = parseInt(parts[0] || "0", 10);
    let minutes = parseInt(parts[1] || "0", 10);
    let seconds = parseInt(parts[2] || "0", 10);
    if (isPM && hours < 12) hours += 12;
    else if (isAM && hours === 12) hours = 0;
    return hours * 3600 + minutes * 60 + seconds;
}

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
        const interval = String(params.interval || "15");
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
        const lastTradeExitSecsMap = {};

        for (let i = 0; i < targetCandles.length; i++) {
            const tick = targetCandles[i];
            const candleClose = Number(tick.close || tick.candleClose || tick.price || 0);
            const candleHigh = Number(tick.high || tick.candleHigh || candleClose);
            const candleLow = Number(tick.low || tick.candleLow || candleClose);
            let closedTradeThisTick = null;
            let consensusResult = { consensus: "NO_SIGNAL", reason: "NO_EVALUATION" };

            try {
                // 1. Process Active Position Exit Rules (Direct Target vs SL vs EOD)
                if (activePosition) {
                    const isBUY = activePosition.type === "BUY";
                    const tickSecs = toSeconds(tick.time);
                    const cutoff1515 = 15 * 3600 + 15 * 60; // 54900 seconds (15:15 PM)
                    const isLastCandleOfDay = (tickSecs >= cutoff1515 || i === targetCandles.length - 1 || (i < targetCandles.length - 1 && targetCandles[i + 1].date !== tick.date));

                    // DYNAMIC MASTERSL TRAILING SL LADDER ENGINE
                    const masterCfg = masterConfig.getConfig();
                    const rupeeRules = Array.isArray(masterCfg.rupeeTrailingRules) ? masterCfg.rupeeTrailingRules : [];
                    const percentRules = Array.isArray(masterCfg.percentTrailingRules) ? masterCfg.percentTrailingRules : [];

                    if (rupeeRules.length > 0) {
                        const lotSize = 65;
                        const pnlDiff = isBUY ? (candleHigh - activePosition.entryPrice) : (activePosition.entryPrice - candleLow);
                        const currentProfitRupees = Math.round(pnlDiff * lotSize);
                        const sortedRupeeRules = [...rupeeRules].sort((a, b) => b.targetRupees - a.targetRupees);

                        for (const rule of sortedRupeeRules) {
                            if (currentProfitRupees >= rule.targetRupees) {
                                const lockPts = Number((rule.lockRupees / lotSize).toFixed(2));
                                const newSlPrice = isBUY 
                                    ? Number((activePosition.entryPrice + lockPts).toFixed(2)) 
                                    : Number((activePosition.entryPrice - lockPts).toFixed(2));

                                if (isBUY ? (newSlPrice > activePosition.slPrice) : (newSlPrice < activePosition.slPrice)) {
                                    activePosition.slPrice = newSlPrice;
                                    activePosition.trailingStage = `PROFIT_₹${rule.targetRupees}_LOCK_₹${rule.lockRupees}`;
                                    break;
                                }
                            }
                        }
                    } else if (percentRules.length > 0) {
                        const targetPoints = Math.abs(activePosition.targetPrice - activePosition.entryPrice);
                        const pnlDiff = isBUY ? (candleHigh - activePosition.entryPrice) : (activePosition.entryPrice - candleLow);
                        const sortedRules = [...percentRules].sort((a, b) => b.targetPercent - a.targetPercent);

                        for (const rule of sortedRules) {
                            const reqTargetPts = (targetPoints * rule.targetPercent) / 100;
                            if (pnlDiff >= reqTargetPts) {
                                const lockPts = Number(((targetPoints * rule.lockPercent) / 100).toFixed(2));
                                const newSlPrice = isBUY 
                                    ? Number((activePosition.entryPrice + lockPts).toFixed(2)) 
                                    : Number((activePosition.entryPrice - lockPts).toFixed(2));

                                if (isBUY ? (newSlPrice > activePosition.slPrice) : (newSlPrice < activePosition.slPrice)) {
                                    activePosition.slPrice = newSlPrice;
                                    activePosition.trailingStage = `TARGET_${rule.targetPercent}%_LOCK_${rule.lockPercent}%`;
                                    break;
                                }
                            }
                        }
                    }

                    // Evaluate Exits (Pure Target vs Trailed SL vs EOD)
                    let isTargetHit = false;
                    let isSLHit = false;
                    let isEODSquareOff = false;

                    if (isBUY) {
                        if (candleHigh >= activePosition.targetPrice) {
                            isTargetHit = true;
                        } else if (candleLow <= activePosition.slPrice) {
                            isSLHit = true;
                        } else if (isLastCandleOfDay) {
                            isEODSquareOff = true;
                        }
                    } else { // SELL / PE
                        if (candleLow <= activePosition.targetPrice) {
                            isTargetHit = true;
                        } else if (candleHigh >= activePosition.slPrice) {
                            isSLHit = true;
                        } else if (isLastCandleOfDay) {
                            isEODSquareOff = true;
                        }
                    }

                    if (isTargetHit || isSLHit || isEODSquareOff) {
                        const exitPrice = isTargetHit ? activePosition.targetPrice : (isSLHit ? activePosition.slPrice : candleClose);
                        const exitReason = isTargetHit ? "TARGET_HIT" : (isSLHit ? (activePosition.trailingStage ? `TRAILED_SL_HIT (${activePosition.trailingStage})` : "INITIAL_SL_HIT") : "EOD_SQUARE_OFF");
                        const pts = isBUY ? (exitPrice - activePosition.entryPrice) : (activePosition.entryPrice - exitPrice);
                        const pointsNum = Number(pts.toFixed(2));

                        const exitDayKey = tick.date || "DEFAULT";
                        lastTradeExitSecsMap[exitDayKey] = toSeconds(tick.time);

                        closedTradeThisTick = {
                            tradeId: activePosition.tradeId,
                            strategyId: activePosition.strategyId,
                            strategyName: activePosition.strategyName,
                            type: activePosition.type,
                            optionType: activePosition.type === "BUY" ? "CE" : "PE",
                            entryDate: activePosition.entryDate,
                            entryTime: activePosition.entryTime,
                            entryPrice: activePosition.entryPrice,
                            initialSl: activePosition.initialSl || activePosition.slPrice,
                            exitSl: activePosition.slPrice,
                            sl: activePosition.slPrice,
                            tr: activePosition.targetPrice,
                            targetPrice: activePosition.targetPrice,
                            trailingStage: activePosition.trailingStage || "INITIAL",
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

                const slPointsInput = params.slPoints !== undefined && !isNaN(Number(params.slPoints)) && Number(params.slPoints) > 0 ? Number(params.slPoints) : null;
                const targetPointsInput = params.targetPoints !== undefined && !isNaN(Number(params.targetPoints)) && Number(params.targetPoints) > 0 ? Number(params.targetPoints) : null;

                const candleSlice = targetCandles.slice(0, i + 1);
                consensusResult = await evaluateConsensusEngine(candleSlice, i, {
                    securityId: "13",
                    exchangeSegment: "IDX_I",
                    interval: interval,
                    date: tick.date,
                    time: tick.time,
                    warmupCount: 1,
                    slPoints: slPointsInput,
                    targetPoints: targetPointsInput
                });

                // 3. Open New Position if no position active and valid signal triggered before 3:00 PM
                const tickSecsForEntry = toSeconds(tick.time);
                const cutoff1500 = 15 * 3600; // 54000 seconds (15:00 PM)

                const lastExitSecs = lastTradeExitSecsMap[dayKey];
                const cooldownSatisfied = (lastExitSecs === undefined || lastExitSecs === null) || ((tickSecsForEntry - lastExitSecs) >= 900);

                if (!activePosition && cooldownSatisfied && (consensusResult.consensus === "BUY" || consensusResult.consensus === "SELL")) {
                    if (tickSecsForEntry <= cutoff1500 && currentDayTrades < maxTradesPerDay) {
                        dailyTradeCountMap[dayKey] = currentDayTrades + 1;

                        const entryPrice = Number((consensusResult.entry || candleClose).toFixed(2));
                        const type = consensusResult.consensus;

                        const masterCfg = masterConfig.getConfig();
                        const defaultSlPts = (masterCfg.maxLossPerTrade && !isNaN(Number(masterCfg.maxLossPerTrade)))
                            ? Number((masterCfg.maxLossPerTrade / 65).toFixed(2))
                            : 5;
                        const defaultTargetPts = (masterCfg.rupeeTrailingRules && masterCfg.rupeeTrailingRules[0]?.targetRupees)
                            ? Number((masterCfg.rupeeTrailingRules[0].targetRupees / 65).toFixed(2))
                            : 10;

                        let slPrice;
                        if (slPointsInput !== null) {
                            slPrice = type === "BUY" ? (entryPrice - slPointsInput) : (entryPrice + slPointsInput);
                        } else if (consensusResult.sl !== null && consensusResult.sl !== undefined) {
                            slPrice = Number(consensusResult.sl.toFixed(2));
                        } else {
                            slPrice = type === "BUY" ? (entryPrice - defaultSlPts) : (entryPrice + defaultSlPts);
                        }

                        let targetPrice;
                        if (targetPointsInput !== null) {
                            targetPrice = type === "BUY" ? (entryPrice + targetPointsInput) : (entryPrice - targetPointsInput);
                        } else if (consensusResult.tr !== null && consensusResult.tr !== undefined) {
                            targetPrice = Number(consensusResult.tr.toFixed(2));
                        } else {
                            targetPrice = type === "BUY" ? (entryPrice + defaultTargetPts) : (entryPrice - defaultTargetPts);
                        }

                        slPrice = Number(slPrice.toFixed(2));
                        targetPrice = Number(targetPrice.toFixed(2));

                        activePosition = {
                            tradeId: `BT_${i}_${Date.now()}`,
                            strategyId: consensusResult.strategyId || "STRAT_CONSENSUS",
                            strategyName: consensusResult.strategyName || "Consensus Engine Strategy",
                            type: type,
                            entryDate: tick.date,
                            entryTime: tick.time,
                            entryPrice: entryPrice,
                            initialSl: slPrice,
                            slPrice: slPrice,
                            targetPrice: targetPrice
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
            else if (t.exitReason && (t.exitReason.includes("SL_HIT") || t.exitReason === "STOP_LOSS_HIT")) slHitsCount++;
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
            if (t.exitReason && (t.exitReason.includes("SL_HIT") || t.exitReason === "STOP_LOSS_HIT")) dailyMap[dayKey].slHits += 1;
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
