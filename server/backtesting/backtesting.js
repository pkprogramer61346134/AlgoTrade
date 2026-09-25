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
        for (let i = 20; i < candles.length; i++) {
            const candle = candles[i];
            const consensusResult = await evaluateConsensusEngine(candles, i);

            console.log(`⌛ [CANDLE TICK ${i + 1}/${candles.length}] ${candle.date} ${candle.time} | Close: ₹${candle.close || candle.candleClose} | Consensus: ${consensusResult ? consensusResult.consensus : 'NO_SIGNAL'}`);

            if (typeof onCandleTick === 'function') {
                await onCandleTick(candle, i, candles.length, consensusResult);
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
    console.log(`\n🚀 [CLI EXECUTION] Running Backtesting Streamer directly...\n`);
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
