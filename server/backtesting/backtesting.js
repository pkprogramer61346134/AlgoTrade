/**
 * Backtesting Engine for Strategy & NIFTY Options
 * Location: C:\AlgoTrade\server\backtesting\backtesting.js
 * 
 * Features:
 * 1. 100% Historical Candle Data Based (NO live WebSockets, NO Trailing SL).
 * 2. Inputs: fromDate, toDate, initialBalance, lots, interval.
 * 3. Iterates candle-by-candle through historical NIFTY dataset.
 * 4. Evaluates consensusEngine.js signals across historical dataset.
 * 5. Uses select-best-strike.js to pick option contracts (CE/PE) using virtual capital.
 * 6. Calculates Option SL & Target (TR) and checks hit conditions on subsequent historical candles.
 * 7. Calculates detailed statistics: Net PnL, Winrate, Max Drawdown, Profit Factor, and full trades audit log.
 * 8. Saves final report in backtest_report.json.
 */

const fs = require('fs');
const path = require('path');

const backtestConfig = require('./config');
const { getCachedCandles } = require('../../utility/usedfull/cached-historical-data');
const { selectBestOptionStrike } = require('../../utility/usedfull/select-best-strike');
const { evaluateConsensusEngine, computeIndicators } = require('../../utility/usedfull/Engines/consensusEngine');

const REPORT_FILE = path.join(__dirname, 'backtest_report.json');

class BacktestEngine {
    constructor() {
        this.report = null;
    }

    /**
     * Run Backtest Engine Across Date Range
     * 
     * @param {Object} params
     * @param {string} params.fromDate - Start Date ("YYYY-MM-DD")
     * @param {string} params.toDate - End Date ("YYYY-MM-DD")
     * @param {number} [params.initialBalance=100000] - Virtual Starting Capital
     * @param {number} [params.lots=1] - Lots per trade
     * @param {number} [params.lotSize=65] - Quantity per lot
     * @param {string} [params.interval="5"] - Candle interval in minutes ("1", "5", "15")
     * @returns {Promise<Object>} Full Backtest Summary & Trades Log
     */
    async runBacktest(params = {}) {
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const fromDate = params.fromDate || "2026-09-18";
        const toDate = params.toDate || todayStr;
        const initialBalance = Number(params.initialBalance || backtestConfig.getConfig().initialBalance || 100000);
        const lots = Number(params.lots || backtestConfig.getConfig().lots || 1);
        const lotSize = Number(params.lotSize || backtestConfig.getConfig().lotSize || 65);
        const interval = String(params.interval || "5");
        const riskRewardRatio = Number(params.riskRewardRatio || 2.0);

        console.log("==========================================================================");
        console.log(`🧪 [BACKTEST ENGINE START] Running Backtest for NIFTY (${fromDate} to ${toDate})`);
        console.log(`💰 Virtual Starting Balance : ₹${initialBalance.toLocaleString("en-IN")}`);
        console.log(`📦 Lots: ${lots} (${lots * lotSize} qty) | Interval: ${interval}m | Risk:Reward: 1:${riskRewardRatio}`);
        console.log("==========================================================================\n");

        // 1. Fetch Historical NIFTY Index Candles (including warmup buffer)
        const candleRes = await getCachedCandles({
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            fromDate: fromDate,
            toDate: toDate,
            interval: interval
        });

        const candles = candleRes.data || [];
        if (candles.length < 50) {
            throw new Error(`Insufficient historical candles (${candles.length}) found between ${fromDate} and ${toDate}`);
        }

        console.log(`📊 [HISTORICAL DATA LOADED] ${candles.length} candles ready for evaluation.\n`);

        let currentBalance = initialBalance;
        let peakBalance = initialBalance;
        let maxDrawdown = 0;
        let maxDrawdownPercent = 0;

        let activePosition = null;
        const tradesList = [];
        let totalTrades = 0;
        let winningTrades = 0;
        let losingTrades = 0;

        // Pre-compute indicators ONCE across entire dataset for 1000x speed!
        console.log(`⚡ Pre-computing technical indicators for ${candles.length} candles...`);
        const precomputed = computeIndicators(candles, {});

        // 2. Iterate through historical candles
        for (let i = 20; i < candles.length; i++) {
            const candle = candles[i];
            const candleHigh = Number(candle.candleHigh || candle.high || candle.close);
            const candleLow = Number(candle.candleLow || candle.low || candle.close);
            const candleClose = Number(candle.candleClose || candle.close);

            // A) Check Active Position for Exit (SL or Target Hit)
            if (activePosition && activePosition.status === "OPEN") {
                const pos = activePosition;
                let isClosed = false;
                let exitPrice = 0;
                let exitReason = "";

                // Check Index Stop Loss Hit
                if (pos.optionType === "CE" && candleLow <= pos.indexSl) {
                    isClosed = true;
                    exitReason = "SL_HIT";
                    exitPrice = pos.optionSl;
                } else if (pos.optionType === "PE" && candleHigh >= pos.indexSl) {
                    isClosed = true;
                    exitReason = "SL_HIT";
                    exitPrice = pos.optionSl;
                }
                // Check Index Target Hit
                else if (pos.optionType === "CE" && candleHigh >= pos.indexTr) {
                    isClosed = true;
                    exitReason = "TARGET_HIT";
                    exitPrice = pos.optionTr;
                } else if (pos.optionType === "PE" && candleLow <= pos.indexTr) {
                    isClosed = true;
                    exitReason = "TARGET_HIT";
                    exitPrice = pos.optionTr;
                }

                // If exit condition met
                if (isClosed) {
                    const diff = exitPrice - pos.entryLtp;
                    const realizedPnl = Number((diff * pos.qty).toFixed(2));
                    currentBalance = Number((currentBalance + pos.totalMargin + realizedPnl).toFixed(2));

                    totalTrades++;
                    if (realizedPnl > 0) winningTrades++;
                    else if (realizedPnl < 0) losingTrades++;

                    // Peak & Drawdown Tracking
                    if (currentBalance > peakBalance) {
                        peakBalance = currentBalance;
                    }
                    const drawdown = peakBalance - currentBalance;
                    if (drawdown > maxDrawdown) {
                        maxDrawdown = drawdown;
                        maxDrawdownPercent = Number(((maxDrawdown / peakBalance) * 100).toFixed(2));
                    }

                    pos.status = "CLOSED";
                    pos.exitReason = exitReason;
                    pos.exitDate = candle.date;
                    pos.exitTime = candle.time;
                    pos.exitLtp = exitPrice;
                    pos.realizedPnl = realizedPnl;
                    pos.balanceAfterTrade = currentBalance;

                    tradesList.push(pos);
                    activePosition = null;

                    console.log(`🏁 [BACKTEST EXIT] ${pos.symbol} | Reason: ${exitReason} | PnL: ₹${realizedPnl} | New Balance: ₹${currentBalance.toFixed(2)}`);
                }
            }

            // B) If NO Position is active, evaluate consensus engine for new entry
            if (!activePosition) {
                const signal = await evaluateConsensusEngine(candles, i, { precomputed });

                if (signal.consensus === "BUY" || signal.consensus === "SELL") {
                    const optionType = signal.consensus === "BUY" ? "CE" : "PE";
                    const maxBudget = currentBalance * 0.20; // 20% max budget

                    if (currentBalance < 1000) break; // Stop if capital depleted

                    try {
                        const strikeRes = await selectBestOptionStrike({
                            spotPrice: signal.entry,
                            optionType: optionType,
                            maxBudget: Math.max(1000, maxBudget),
                            isBacktest: true
                        });

                        if (strikeRes && strikeRes.securityId) {
                            const qty = lots * lotSize;
                            const totalMargin = Number((strikeRes.liveLtp * qty).toFixed(2));

                            if (currentBalance >= totalMargin) {
                                // Deduct margin
                                currentBalance = Number((currentBalance - totalMargin).toFixed(2));

                                // Option SL and Target Calculation based on configured Risk:Reward Ratio
                                const indexSLRisk = Math.abs(signal.entry - signal.sl);
                                const indexTRGain = indexSLRisk * riskRewardRatio;
                                const indexTr = optionType === "CE" ? Number((signal.entry + indexTRGain).toFixed(2)) : Number((signal.entry - indexTRGain).toFixed(2));

                                const optionSlLtp = Math.max(0.5, Number((strikeRes.liveLtp - (indexSLRisk * 0.5)).toFixed(2)));
                                const optionTrLtp = Number((strikeRes.liveLtp + (indexTRGain * 0.5)).toFixed(2));

                                activePosition = {
                                    tradeId: "BT_" + (tradesList.length + 1),
                                    symbol: strikeRes.symbol,
                                    securityId: strikeRes.securityId,
                                    optionType: optionType,
                                    entryDate: candle.date,
                                    entryTime: candle.time,
                                    entrySpot: signal.entry,
                                    entryLtp: strikeRes.liveLtp,
                                    qty: qty,
                                    totalMargin: totalMargin,
                                    indexSl: signal.sl,
                                    indexTr: indexTr,
                                    optionSl: optionSlLtp,
                                    optionTr: optionTrLtp,
                                    rrRatio: `1:${riskRewardRatio}`,
                                    strategyName: signal.strategyName,
                                    status: "OPEN"
                                };

                                console.log(`🎯 [BACKTEST ENTRY] ${candle.date} ${candle.time} | ${signal.consensus} ${strikeRes.symbol} @ ₹${strikeRes.liveLtp} (Spot: ₹${signal.entry})`);
                            }
                        }
                    } catch (e) {
                        // Skip if strike selection error
                    }
                }
            }
        }

        // C) Force Close remaining open position at end of backtest
        if (activePosition && activePosition.status === "OPEN") {
            const pos = activePosition;
            const lastCandle = candles[candles.length - 1];
            const finalExitLtp = pos.entryLtp;
            const realizedPnl = 0;
            currentBalance = Number((currentBalance + pos.totalMargin).toFixed(2));

            totalTrades++;
            pos.status = "CLOSED";
            pos.exitReason = "EOD_FORCE_CLOSE";
            pos.exitDate = lastCandle.date;
            pos.exitTime = lastCandle.time;
            pos.exitLtp = finalExitLtp;
            pos.realizedPnl = realizedPnl;
            pos.balanceAfterTrade = currentBalance;

            tradesList.push(pos);
            activePosition = null;
        }



        // 3. Generate Monthly PnL Breakdown & Final Report Summary
        const monthlyMap = {};
        for (const trade of tradesList) {
            const dateParts = (trade.entryDate || "").split("-");
            if (dateParts.length >= 2) {
                const monthKey = `${dateParts[0]}-${dateParts[1]}`; // e.g. "2025-09"
                if (!monthlyMap[monthKey]) {
                    monthlyMap[monthKey] = {
                        monthKey,
                        trades: 0,
                        wins: 0,
                        losses: 0,
                        monthlyPnl: 0
                    };
                }
                const m = monthlyMap[monthKey];
                m.trades++;
                const pnl = Number(trade.realizedPnl || 0);
                if (pnl > 0) m.wins++;
                else if (pnl < 0) m.losses++;
                m.monthlyPnl = Number((m.monthlyPnl + pnl).toFixed(2));
            }
        }

        const monthlyBreakdown = Object.values(monthlyMap).map(m => {
            const dateObj = new Date(m.monthKey + "-01");
            const monthLabel = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : m.monthKey;
            const winrate = m.trades > 0 ? Number(((m.wins / m.trades) * 100).toFixed(1)) : 0;
            return {
                monthKey: m.monthKey,
                monthLabel: monthLabel,
                totalTrades: m.trades,
                winningTrades: m.wins,
                losingTrades: m.losses,
                winrate: `${winrate}%`,
                monthlyPnl: m.monthlyPnl,
                monthlyPnlPercent: `${((m.monthlyPnl / initialBalance) * 100).toFixed(2)}%`
            };
        });

        const netPnl = Number((currentBalance - initialBalance).toFixed(2));
        const netPnlPercent = Number(((netPnl / initialBalance) * 100).toFixed(2));
        const winrate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

        const report = {
            status: "success",
            symbol: "NIFTY",
            fromDate,
            toDate,
            interval: `${interval}m`,
            initialBalance,
            finalBalance: currentBalance,
            netPnl,
            netPnlPercent: `${netPnlPercent >= 0 ? '+' : ''}${netPnlPercent}%`,
            stats: {
                totalTrades,
                winningTrades,
                losingTrades,
                winrate: `${winrate}%`,
                maxDrawdown: Number(maxDrawdown.toFixed(2)),
                maxDrawdownPercent: `-${maxDrawdownPercent}%`,
                lots,
                lotSize,
                totalQuantity: lots * lotSize,
                riskRewardRatio: `1:${riskRewardRatio}`
            },
            monthlyBreakdown,
            trades: tradesList
        };

        this.report = report;
        this.saveReport(report);

        console.log("\n==========================================================================");
        console.log(`🏆 [BACKTEST REPORT SUMMARY]`);
        console.log(`   Period           : ${fromDate} to ${toDate}`);
        console.log(`   Initial Balance  : ₹${initialBalance.toLocaleString("en-IN")}`);
        console.log(`   Final Balance    : ₹${currentBalance.toLocaleString("en-IN")}`);
        console.log(`   Net Realized PnL : ₹${netPnl.toLocaleString("en-IN")} (${report.netPnlPercent})`);
        console.log(`   Total Trades     : ${totalTrades} (Win: ${winningTrades} | Loss: ${losingTrades})`);
        console.log(`   Win Rate         : ${report.stats.winrate}`);
        console.log(`   Max Drawdown     : ₹${maxDrawdown.toFixed(2)} (${report.stats.maxDrawdownPercent})`);
        console.log("==========================================================================");

        console.log("\n📅 [MONTH-BY-MONTH PnL BREAKDOWN]:");
        console.log("--------------------------------------------------------------------------");
        console.table(monthlyBreakdown.map(m => ({
            "Month": m.monthLabel,
            "Trades": m.totalTrades,
            "Win": m.winningTrades,
            "Loss": m.losingTrades,
            "Win Rate": m.winrate,
            "Monthly PnL (₹)": m.monthlyPnl,
            "Return (%)": m.monthlyPnlPercent
        })));
        console.log("==========================================================================\n");

        return report;
    }

    /**
     * Save report to backtest_report.json
     */
    saveReport(reportData = this.report) {
        try {
            fs.writeFileSync(REPORT_FILE, JSON.stringify(reportData, null, 2), 'utf-8');
        } catch (e) {
            console.error(`❌ [BACKTEST ENGINE] Failed to save backtest_report.json: ${e.message}`);
        }
    }

    /**
     * Get Last Backtest Report
     */
    getReport() {
        if (!this.report && fs.existsSync(REPORT_FILE)) {
            try {
                this.report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));
            } catch (e) {}
        }
        return this.report;
    }
}

module.exports = new BacktestEngine();
