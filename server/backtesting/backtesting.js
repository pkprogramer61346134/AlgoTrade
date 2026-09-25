/**
 * Backtesting Historical Data Streamer Engine
 * Location: C:\AlgoTrade\server\backtesting\backtesting.js
 * 
 * Features:
 * Uses cached-historical-data.js to load NIFTY candles and send them candle-by-candle (tick-by-tick).
 * Runs directly in terminal via `node server/backtesting/backtesting.js`.
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
     * Fetch historical candles using cached-historical-data.js and stream them candle-by-candle
     * 
     * @param {Object} params
     * @param {string} params.fromDate - Start Date ("YYYY-MM-DD")
     * @param {string} params.toDate - End Date ("YYYY-MM-DD")
     * @param {string} [params.interval="5"] - Candle interval in minutes ("1", "5", "15")
     * @param {Function} [onCandleTick] - Callback function triggered for each candle (candle, index, totalCandles)
     * @returns {Promise<Array>} Array of all historical candles
     */
    async streamHistoricalCandles(params = {}, onCandleTick = null) {
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const fromDate = params.fromDate || "2026-09-18";
        const toDate = params.toDate || todayStr;
        const interval = String(params.interval || "5");

        console.log("==========================================================================");
        console.log(`📜 [HISTORICAL CANDLE STREAMER] Loading NIFTY candles (${fromDate} to ${toDate})`);
        console.log("==========================================================================\n");

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
            return [];
        }

        console.log(`✅ [HISTORICAL STREAMER] Loaded ${candles.length} candles. Streaming candle-by-candle...\n`);

        // Send candles tick-by-tick / candle-by-candle
        for (let i = 0; i < candles.length; i++) {
            const tick = candles[i];
            tick.price = Number(tick.close || tick.candleClose || tick.price || 0);

            try {
                // 4. Evaluate Consensus Engine on live tick with 200 warmup candles
                const consensusResult = await evaluateConsensusEngine(tick, -1, {
                    securityId: "13",
                    exchangeSegment: "IDX_I",
                    interval: interval,
                    warmupCount: 200
                });

                // 7. Live Console Strategy Monitor
                let signalBadge = "⚪ NO SIGNAL / WAITING";
                let waitTimerLine = "";

                if (consensusResult.consensus === "BUY") signalBadge = "🟢 BUY SIGNAL CONFIRMED & TRIGGERED";
                if (consensusResult.consensus === "SELL") signalBadge = "🔴 SELL SIGNAL CONFIRMED & TRIGGERED";
                if (consensusResult.consensus === "WAITING_CONFIRMATION") {
                    const elapsedMins = consensusResult.confirmation?.elapsedMins || 0;
                    const reqMins = consensusResult.confirmation?.requiredWaitMins || 0.5;
                    const remMins = consensusResult.confirmation?.remainingMins !== undefined ? consensusResult.confirmation.remainingMins : (reqMins - elapsedMins);
                    const remSecs = Math.max(0, Math.round(remMins * 60));
                    const rawDir = consensusResult.rawType === "BUY" ? "🟢 BUY" : "🔴 SELL";

                    signalBadge = `⏳ WAITING CONFIRMATION [${rawDir}]`;
                    waitTimerLine = `⏳ Signal Wait   : ${remSecs}s Remaining (${elapsedMins}m / ${reqMins}m Configured)`;
                }

                console.clear();
                console.log("==========================================================================");
                console.log("🧠 CENTRAL STRATEGY CONSENSUS HEAD - LIVE MARKET MONITOR");
                console.log("==========================================================================");
                console.log(`⏰ Time          : ${tick.date || ''} ${tick.time || ''}`);
                console.log(`📈 Live NIFTY    : ₹${tick.price ? Number(tick.price).toFixed(2) : '0.00'}`);
                console.log(`⚡ Final Consensus: ${signalBadge}`);
                if (waitTimerLine) {
                    console.log(waitTimerLine);
                }
                console.log(`📊 Votes Summary  : 🟢 ${consensusResult.buyVotes || 0} BUY | 🔴 ${consensusResult.sellVotes || 0} SELL (Min Required: ${consensusResult.minVotesRequired || 2})`);
                console.log(`💪 Confidence    : ${consensusResult.confidence || '0%'}`);
                console.log(`💵 Entry Price   : ${consensusResult.entry ? '₹' + consensusResult.entry : '--'}`);
                console.log(`🎯 Target (TR)   : ${consensusResult.tr ? '₹' + consensusResult.tr : '--'}`);
                console.log(`🛑 Stop Loss (SL): ${consensusResult.sl ? '₹' + consensusResult.sl : '--'}`);
                console.log("--------------------------------------------------------------------------");
                console.log("📋 STRATEGY VOTES BREAKDOWN:");

                if (Array.isArray(consensusResult.strategyStates) && consensusResult.strategyStates.length > 0) {
                    const tableData = consensusResult.strategyStates.map(s => {
                        let voteText = "❌ NO (NEUTRAL)";
                        if (s.vote === "BUY") voteText = "🟢 YES (BUY)";
                        if (s.vote === "SELL") voteText = "🔴 YES (SELL)";

                        return {
                            "Strategy Name": s.strategyName || s.strategyId,
                            "Vote Status": voteText,
                            "Reason / Key Filter": s.reason || "--",
                            "Confidence": s.confidence || '70%',
                            "Target (TR)": s.tr ? '₹' + s.tr : '--',
                            "Stop Loss (SL)": s.sl ? '₹' + s.sl : '--'
                        };
                    });
                    console.table(tableData);
                } else {
                    console.log("Awaiting Strategy Evaluations...");
                }
                console.log("==========================================================================");

                if (typeof onCandleTick === 'function') {
                    await onCandleTick(tick, i, candles.length, consensusResult);
                }

            } catch (err) {
                console.error("❌ Consensus Engine Error:", err.message);
            }
        }

        return candles;
    }

    /**
     * Main Backtest Execution Runner
     */
    async runBacktest(params = {}) {
        const candles = await this.streamHistoricalCandles(params);
        return {
            status: "success",
            totalCandles: candles.length,
            data: candles
        };
    }

    saveReport(reportData = this.report) {
        try {
            fs.writeFileSync(REPORT_FILE, JSON.stringify(reportData, null, 2), 'utf-8');
        } catch (e) {}
    }

    getReport() {
        if (!this.report && fs.existsSync(REPORT_FILE)) {
            try {
                this.report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));
            } catch (e) {}
        }
        return this.report;
    }
}

const engine = new BacktestEngine();

// CLI Direct Execution Support: `node server/backtesting/backtesting.js`
if (require.main === module) {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    engine.streamHistoricalCandles({
        fromDate: "2026-09-25",
        toDate: todayStr,
        interval: "5"
    }).then(candles => {
        console.log(`\n✅ [CLI COMPLETE] Finished streaming ${candles.length} candles.`);
    }).catch(err => {
        console.error(`❌ [CLI ERROR] ${err.message}`);
    });
}

module.exports = engine;
