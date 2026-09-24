/**
 * Paper Trading Master Manager & Signal Handler
 * Location: C:\AlgoTrade\server\pepertread\pepertread.js
 * 
 * Features:
 * 1. ZERO internal DhanLivePrice WebSocket dependency. Receives live tick/candle data from central loop (e.g. main.js).
 * 2. Feeds tick/candle data into C:\AlgoTrade\utility\usedfull\Engines\consensusEngine.js.
 * 3. Checks if an active paper trade is already open:
 *    - If OPEN: Ignores new consensus signal until active trade closes.
 *    - If NO ACTIVE TRADE: Delegates execution to paper_trailingsl.js.
 * 4. paper_trailingsl.js selects best strike, calculates TR1-TR4 targets & SL, tracks live option LTP, and updates trade_record.json + paper_config.json.
 * 5. Exposes structured payload getters for UI integration.
 */

const paperConfig = require('./config');
const paperTrailingSLEngine = require('./paper_trailingsl');

class PaperTradeEngine {
    constructor() {
        this.isProcessingTick = false;
    }

    /**
     * Active Position getter matching paperTrailingSLEngine state
     */
    get activePosition() {
        return paperTrailingSLEngine.activePosition;
    }

    /**
     * Trade History getter matching paperTrailingSLEngine state
     */
    get tradeHistory() {
        return paperTrailingSLEngine.tradeHistory;
    }

    /**
     * Main Control: Enable Paper Trading & Resume Live Option Tracking if position exists
     */
    async startPaperTrading() {
        paperConfig.setEnabled(true);
        const cfg = paperConfig.getConfig();
        const selectedStock = cfg.selectedStock;

        console.log("==========================================================================");
        console.log(`🚀 [PAPER ENGINE START] Paper Trading Handler Active (Decoupled Mode)`);
        console.log(`💰 Active Dummy Balance : ₹${cfg.currentBalance} (Initial: ₹${cfg.initialBalance})`);
        console.log(`📈 Selected Scrip Target : ${selectedStock.symbol} (ID: ${selectedStock.securityId})`);
        console.log("==========================================================================\n");

        // If an active paper position exists, resume live option tracking
        if (paperTrailingSLEngine.activePosition && paperTrailingSLEngine.activePosition.status === "OPEN") {
            console.log(`📌 Resuming live option tracking for existing open paper position: ${paperTrailingSLEngine.activePosition.symbol}...`);
            paperTrailingSLEngine.startOptionLiveTracking();
        }
    }

    /**
     * Main Control: Disable Paper Trading
     */
    stopPaperTrading() {
        paperConfig.setEnabled(false);
        if (paperTrailingSLEngine.optionTracker) {
            try { paperTrailingSLEngine.optionTracker.close(); } catch (e) {}
            paperTrailingSLEngine.optionTracker = null;
        }
        console.log("⏹️ [PAPER ENGINE STOP] Paper Trading service paused.");
    }

    /**
     * Process Consensus Signal (Evaluated centrally in main.js)
     * 
     * @param {Object} signal - Evaluated signal object from consensusEngine.js
     * @param {Object} [stockInfo] - Optional stock info
     */
    async processSignal(signal, stockInfo = null) {
        if (!paperConfig.getConfig().paperTradeEnabled || !signal) return null;

        // 1. Check if paper trade is ALREADY active
        if (paperTrailingSLEngine.activePosition && paperTrailingSLEngine.activePosition.status === "OPEN") {
            // SILENT IGNORE: Do NOT flood console with repetitive logs when trade is active
            return { status: "IGNORED", reason: "POSITION_ALREADY_OPEN" };
        }

        // 2. If BUY or SELL signal is triggered and NO trade is active
        if (signal.consensus === "BUY" || signal.consensus === "SELL") {
            const selectedStock = stockInfo || paperConfig.getConfig().selectedStock;
            console.log(`\n🎯 [PAPER SIGNAL DETECTED] Signal: ${signal.consensus} | Entry Spot: ₹${signal.entry} | Strategy: ${signal.strategyName}`);
            const pos = await this.executePaperOrder(signal, selectedStock);
            return { status: "EXECUTED", signal, position: pos };
        }

        return { status: "NO_SIGNAL", signal };
    }

    /**
     * Backward compatibility alias
     */
    async processCandleTick(signalOrTick, stockInfo = null) {
        if (signalOrTick && signalOrTick.consensus) {
            return await this.processSignal(signalOrTick, stockInfo);
        }
        return null;
    }

    /**
     * Order Execution: Selects Best Option Strike & places paper trade via paper_trailingsl.js
     */
    async executePaperOrder(signal, selectedStock) {
        return await paperTrailingSLEngine.executePaperTrailingTrade(signal, selectedStock || paperConfig.getConfig().selectedStock);
    }

    /**
     * Close Active Paper Position
     */
    closePaperPosition(reason = "MANUAL_EXIT", exitLtp = null) {
        return paperTrailingSLEngine.closePaperPosition(reason, exitLtp);
    }

    /**
     * Get Complete State Payload for UI Rendering
     */
    getStatus() {
        return paperTrailingSLEngine.getStatus();
    }
}

module.exports = new PaperTradeEngine();
