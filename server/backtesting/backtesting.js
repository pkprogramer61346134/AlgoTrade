/**
 * Backtesting Historical Data Streamer Engine & Trailing SL Simulator
 * Location: C:\AlgoTrade\server\backtesting\backtesting.js
 * 
 * Features:
 * Uses cached-historical-data.js to load NIFTY candles.
 * Evaluates consensusEngine.js and simulates trailing SL trades via backtest_trailingsl.js.
 * Displays clean final Backtest Report & Trades Audit log.
 */

const fs = require('fs');
const path = require('path');
const { getCachedCandles } = require('../../utility/usedfull/cached-historical-data');
const { evaluateConsensusEngine } = require('../../utility/usedfull/Engines/consensusEngine');
const backtestTrailingSLEngine = require('./backtest_trailingsl');

const REPORT_FILE = path.join(__dirname, 'backtest_report.json');

class BacktestEngine {
    constructor() {
        this.report = null;
    }

    /**
     * Fetch historical candles using cached-historical-data.js, evaluate consensus, & simulate trailing SL trades
     * 
     * @param {Object} params
     * @param {string} params.fromDate - Start Date ("YYYY-MM-DD")
     * @param {string} params.toDate - End Date ("YYYY-MM-DD")
     * @param {string} [params.interval="5"] - Candle interval in minutes ("1", "5", "15")
     * @param {Function} [onCandleTick] - Callback function triggered for each candle
     * @returns {Promise<Array>} Array of all historical candles
     */
    async streamHistoricalCandles(params = {}, onCandleTick = null) {
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const fromDate = params.fromDate || "2026-09-21";
        const toDate = params.toDate || todayStr;
        const interval = String(params.interval || "5");
        const initialBalance = Number(params.initialBalance !== undefined ? params.initialBalance : 10000);
        const lots = Number(params.lots || 1);
        const lotSize = Number(params.lotSize || 65);
        const maxTradesPerDay = Number(params.maxTradesPerDay || 3);
        const targetMode = String(params.targetMode || "TRAILING").toUpperCase();
        const maxLossPerTrade = Number(params.maxLossPerTrade !== undefined ? params.maxLossPerTrade : 300);

        console.log("==========================================================================");
        console.log(`🧪 [BACKTEST ENGINE] Running NIFTY Backtest (${fromDate} to ${toDate})`);
        console.log(` Config: Capital ₹${initialBalance.toLocaleString('en-IN')}, Interval: ${interval}m, Lots: ${lots} (${lots * lotSize} qty), Max Trades/Day: ${maxTradesPerDay}, Target Mode: ${targetMode}, Max Loss/Trade: ₹${maxLossPerTrade}`);
        console.log("==========================================================================\n");

        // Set custom lot size, max daily trades, target mode, and max loss per trade in engine
        backtestTrailingSLEngine.lotSize = lots * lotSize;
        backtestTrailingSLEngine.maxTradesPerDay = maxTradesPerDay;
        backtestTrailingSLEngine.targetMode = targetMode;
        backtestTrailingSLEngine.maxLossPerTrade = maxLossPerTrade;

        // Reset Backtest Trailing Engine state
        backtestTrailingSLEngine.resetEngine();

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
                initialBalance,
                finalBalance: initialBalance,
                netPnl: 0,
                netPnlPercent: "0%",
                totalCandles: 0,
                stats: {
                    totalTrades: 0,
                    winningTrades: 0,
                    losingTrades: 0,
                    winrate: "0%",
                    maxDrawdown: 0,
                    maxDrawdownPercent: "0%",
                    profitFactor: "0.00",
                    avgTradePnl: 0,
                    lots,
                    lotSize,
                    totalQuantity: lots * lotSize
                },
                dailyBreakdown: [],
                monthlyBreakdown: [],
                trades: []
            };
            this.report = emptyReport;
            this.saveReport(emptyReport);
            return { candles: [], report: emptyReport };
        }

        console.log(`✅ [HISTORICAL STREAMER] Loaded ${candles.length} candles. Evaluating candle-by-candle...\n`);

        let prevTradeCount = 0;

        // Send candles tick-by-tick / candle-by-candle
        for (let i = 0; i < candles.length; i++) {
            const tick = candles[i];
            tick.price = Number(tick.close || tick.candleClose || tick.price || 0);

            try {
                // 1. Evaluate Consensus Engine on live tick with 200 warmup candles window
                const candleWindow = candles.slice(Math.max(0, i - 200), i + 1);
                const consensusResult = await evaluateConsensusEngine(candleWindow, -1, {
                    securityId: "13",
                    exchangeSegment: "IDX_I",
                    interval: interval,
                    warmupCount: 200,
                    confirmWaitMinutes: 0,
                    minVotes: 4
                });

                // 2. Evaluate open trade Trailing SL & Exit conditions
                const closedPos = backtestTrailingSLEngine.processTick(tick);

                // 3. Process signal in Backtest Trailing SL Engine (Blocks new signal if trade is ALREADY OPEN!)
                const signalRes = backtestTrailingSLEngine.processSignal(consensusResult, tick);

                const currentStatus = backtestTrailingSLEngine.getStatus();
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
                        tradeCount: currentStatus.totalTrades,
                        totalPnl: currentStatus.totalPnl,
                        latestClosedTrade: closedPos && closedPos.status === "CLOSED" ? closedPos : null
                    });
                }

            } catch (err) {
                console.error("❌ Consensus Engine Error:", err.message);
            }
        }

        // Force close any open position at EOD
        backtestTrailingSLEngine.forceClosePosition(candles[candles.length - 1]);

        // -------------------------------------------------------------
        // CALCULATE DETAILED BACKTEST STATS & REPORT
        // -------------------------------------------------------------
        const status = backtestTrailingSLEngine.getStatus();
        const tradesList = status.history;
        const totalPnl = status.totalPnl;
        const finalBalance = Number((initialBalance + totalPnl).toFixed(2));
        const netPnlPercentNum = initialBalance > 0 ? ((totalPnl / initialBalance) * 100) : 0;
        const netPnlPercentStr = `${netPnlPercentNum >= 0 ? '+' : ''}${netPnlPercentNum.toFixed(2)}%`;

        let peakBalance = initialBalance;
        let runningBalance = initialBalance;
        let maxDrawdown = 0;
        let grossProfit = 0;
        let grossLoss = 0;

        // Daily breakdown map
        const dailyMap = {};

        tradesList.forEach(t => {
            const pnl = t.realizedPnl || 0;
            runningBalance += pnl;

            if (runningBalance > peakBalance) {
                peakBalance = runningBalance;
            }
            const drawdown = peakBalance - runningBalance;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }

            if (pnl > 0) grossProfit += pnl;
            if (pnl < 0) grossLoss += Math.abs(pnl);

            // Daily tracking
            const dayKey = t.exitDate || t.entryDate || "Unknown";
            if (!dailyMap[dayKey]) {
                dailyMap[dayKey] = { date: dayKey, totalTrades: 0, winningTrades: 0, losingTrades: 0, pnl: 0 };
            }
            dailyMap[dayKey].totalTrades += 1;
            dailyMap[dayKey].pnl = Number((dailyMap[dayKey].pnl + pnl).toFixed(2));
            if (pnl > 0) dailyMap[dayKey].winningTrades += 1;
            if (pnl < 0) dailyMap[dayKey].losingTrades += 1;
        });

        const dailyBreakdown = Object.values(dailyMap).map(d => ({
            ...d,
            winrate: d.totalTrades > 0 ? `${((d.winningTrades / d.totalTrades) * 100).toFixed(0)}%` : "0%"
        }));

        // Monthly breakdown map
        const monthlyMap = {};
        tradesList.forEach(t => {
            const dateStr = t.exitDate || t.entryDate || "";
            const monthKey = dateStr ? dateStr.substring(0, 7) : "Unknown"; // "YYYY-MM"
            if (!monthlyMap[monthKey]) {
                monthlyMap[monthKey] = { month: monthKey, totalTrades: 0, winningTrades: 0, losingTrades: 0, pnl: 0 };
            }
            monthlyMap[monthKey].totalTrades += 1;
            monthlyMap[monthKey].pnl = Number((monthlyMap[monthKey].pnl + (t.realizedPnl || 0)).toFixed(2));
            if ((t.realizedPnl || 0) > 0) monthlyMap[monthKey].winningTrades += 1;
            if ((t.realizedPnl || 0) < 0) monthlyMap[monthKey].losingTrades += 1;
        });

        const monthlyBreakdown = Object.values(monthlyMap).map(m => ({
            ...m,
            winrate: m.totalTrades > 0 ? `${((m.winningTrades / m.totalTrades) * 100).toFixed(0)}%` : "0%"
        }));

        const maxDrawdownPercent = initialBalance > 0 ? ((maxDrawdown / initialBalance) * 100).toFixed(2) + "%" : "0%";
        const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? "99.00" : "0.00");
        const avgTradePnl = status.totalTrades > 0 ? Number((totalPnl / status.totalTrades).toFixed(2)) : 0;

        const completeReport = {
            status: "success",
            symbol: "NIFTY",
            fromDate,
            toDate,
            interval: `${interval}m`,
            initialBalance,
            finalBalance,
            netPnl: totalPnl,
            netPnlPercent: netPnlPercentStr,
            totalCandles: candles.length,
            stats: {
                totalTrades: status.totalTrades,
                winningTrades: status.winningTrades,
                losingTrades: status.losingTrades,
                winrate: status.winrate,
                maxDrawdown: Number(maxDrawdown.toFixed(2)),
                maxDrawdownPercent,
                grossProfit: Number(grossProfit.toFixed(2)),
                grossLoss: Number(grossLoss.toFixed(2)),
                profitFactor,
                avgTradePnl,
                lots,
                lotSize,
                totalQuantity: lots * lotSize,
                targetMode: targetMode,
                maxLossPerTrade: maxLossPerTrade
            },
            dailyBreakdown,
            monthlyBreakdown,
            trades: tradesList
        };

        this.report = completeReport;
        this.saveReport(completeReport);

        console.log("\n==========================================================================");
        console.log("🏆 BACKTEST REPORT SUMMARY & TRADES AUDIT LOG");
        console.log("==========================================================================");
        console.log(` Period           : ${fromDate} to ${toDate}`);
        console.log(` Total Candles    : ${candles.length}`);
        console.log(` Initial Capital  : ₹${initialBalance.toLocaleString('en-IN')}`);
        console.log(` Final Balance    : ₹${finalBalance.toLocaleString('en-IN')}`);
        console.log(` Net PnL          : ₹${totalPnl.toFixed(2)} (${netPnlPercentStr})`);
        console.log(` Total Trades     : ${status.totalTrades}`);
        console.log(` Winning Trades   : ${status.winningTrades} 🟢`);
        console.log(` Losing Trades    : ${status.losingTrades} 🔴`);
        console.log(` Win Rate         : ${status.winrate}`);
        console.log(` Max Drawdown     : ₹${maxDrawdown.toFixed(2)} (${maxDrawdownPercent})`);
        console.log(` Profit Factor    : ${profitFactor}`);
        console.log("==========================================================================");

        if (tradesList.length > 0) {
            console.log("\n📋 EXECUTED TRADES AUDIT LOG:");
            console.table(tradesList.map(t => ({
                "Trade ID": t.tradeId,
                "Entry Time": `${t.entryDate} ${t.entryTime}`,
                "Type": t.optionType,
                "Entry Spot": `₹${t.entryPrice}`,
                "Exit Time": `${t.exitDate || ''} ${t.exitTime || ''}`,
                "Exit Spot": `₹${t.exitPrice}`,
                "Exit Reason": t.exitReason,
                "PnL (₹)": `₹${t.realizedPnl}`
            })));
        } else {
            console.log("\nℹ️ No confirmed trades were triggered during this backtest period.");
        }
        console.log("==========================================================================\n");

        return { candles, report: completeReport };
    }

    /**
     * Main Backtest Execution Runner
     */
    async runBacktest(params = {}) {
        const result = await this.streamHistoricalCandles(params);
        return result.report;
    }

    saveReport(reportData = this.report) {
        try {
            fs.writeFileSync(REPORT_FILE, JSON.stringify(reportData, null, 2), 'utf-8');
        } catch (e) {
            console.error("❌ Failed saving backtest report:", e.message);
        }
    }

    getReport() {
        if (!this.report && fs.existsSync(REPORT_FILE)) {
            try {
                this.report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));
            } catch (e) { }
        }
        return this.report;
    }
}

const engine = new BacktestEngine();

// CLI Direct Execution Support: `node server/backtesting/backtesting.js`
if (require.main === module) {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    engine.streamHistoricalCandles({
        fromDate: "2026-09-21",
        toDate: todayStr,
        interval: "5"
    }).then(res => {
        console.log(`✅ [CLI COMPLETE] Finished backtesting ${res.candles.length} candles.`);
    }).catch(err => {
        console.error(`❌ [CLI ERROR] ${err.message}`);
    });
}

module.exports = engine;

