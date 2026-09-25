/**
 * Real Trading Master Manager & Signal Handler
 * Location: C:\AlgoTrade\server\realtread\realtread.js
 * 
 * Features:
 * 1. ZERO internal DhanLivePrice WebSocket dependency. Receives live tick/candle data from central loop (e.g. main.js).
 * 2. Feeds tick/candle data into C:\AlgoTrade\utility\usedfull\Engines\consensusEngine.js.
 * 3. Checks if an active real trade is already open:
 *    - If OPEN: Ignores new consensus signal until active trade closes.
 *    - If NO ACTIVE TRADE: Delegates execution to server/trailingsl/trailingsl.js (REAL BROKER ORDERS via smart-order-executor.js).
 * 4. trailingsl.js selects best strike, calculates TR1-TR4 targets & SL, places real order, tracks live option LTP, and updates trade_record.json.
 * 5. Exposes structured payload getters for UI integration.
 */

const realConfig = require('./config');
const trailingSLEngine = require('../trailingsl/trailingsl');
const { DhanFunds } = require('../../utility/dhan-funds');

class RealTradeEngine {
    constructor() {
        this.isProcessingTick = false;
        this.dhanFunds = new DhanFunds();
        this.latestFunds = null;
        this.lastFundsFetch = 0;
    }

    /**
     * Active Position getter matching trailingSLEngine state
     */
    get activePosition() {
        return trailingSLEngine.activePosition;
    }

    /**
     * Trade History getter matching trailingSLEngine state
     */
    get tradeHistory() {
        return trailingSLEngine.tradeHistory;
    }

    /**
     * Main Control: Enable Real Trading & Resume Live Option Tracking if position exists
     */
    async startRealTrading() {
        realConfig.setEnabled(true);
        const cfg = realConfig.getConfig();
        const selectedStock = cfg.selectedStock;

        console.log("==========================================================================");
        console.log(`⚠️ [REAL ENGINE START] Real Trading Handler Active (LIVE CAPITAL TRADING MODE)`);
        console.log(`📈 Selected Scrip Target : ${selectedStock.symbol} (ID: ${selectedStock.securityId})`);
        console.log("==========================================================================\n");

        await this.fetchLiveFunds();

        // If an active real position exists, resume live option tracking
        if (trailingSLEngine.activePosition && trailingSLEngine.activePosition.status === "OPEN") {
            console.log(`📌 Resuming live option tracking for existing open real position: ${trailingSLEngine.activePosition.symbol}...`);
            trailingSLEngine.startOptionLiveTracking();
        }
    }

    /**
     * Fetch Live Funds from Dhan API
     */
    async fetchLiveFunds() {
        try {
            const res = await this.dhanFunds.getFundLimits();
            if (res.status === "success" && res.data) {
                this.latestFunds = res.data;
                this.lastFundsFetch = Date.now();
                return res.data;
            }
        } catch (e) {
            console.error(`❌ [REAL ENGINE] Error fetching Dhan funds: ${e.message}`);
        }
        return this.latestFunds;
    }

    /**
     * Main Control: Disable Real Trading
     */
    stopRealTrading() {
        realConfig.setEnabled(false);
        if (trailingSLEngine.optionTracker) {
            try { trailingSLEngine.optionTracker.close(); } catch (e) {}
            trailingSLEngine.optionTracker = null;
        }
        console.log("⏹️ [REAL ENGINE STOP] Real Trading service paused.");
    }

    /**
     * Process Consensus Signal (Evaluated centrally in main.js)
     * 
     * @param {Object} signal - Evaluated signal object from consensusEngine.js
     * @param {Object} [stockInfo] - Optional stock info
     */
    async processSignal(signal, stockInfo = null) {
        if (!realConfig.getConfig().realTradeEnabled || !signal) return null;

        // 1. Check if real trade is ALREADY active
        if (trailingSLEngine.activePosition && trailingSLEngine.activePosition.status === "OPEN") {
            // SILENT IGNORE: Do NOT flood console with repetitive logs when trade is active
            return { status: "IGNORED", reason: "POSITION_ALREADY_OPEN" };
        }

        // 2. If BUY or SELL signal is triggered and NO trade is active
        if (signal.consensus === "BUY" || signal.consensus === "SELL") {
            const selectedStock = stockInfo || realConfig.getConfig().selectedStock;
            console.log(`\n🎯 [REAL SIGNAL DETECTED] Signal: ${signal.consensus} | Entry Spot: ₹${signal.entry} | Strategy: ${signal.strategyName}`);
            const pos = await this.executeRealOrder(signal, selectedStock);
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
     * Order Execution: Selects Best Option Strike & places REAL order via server/trailingsl/trailingsl.js
     */
    async executeRealOrder(signal, selectedStock) {
        const optionType = signal.consensus === "BUY" ? "CE" : "PE";
        const cfg = realConfig.getConfig();
        let maxBudget = Number(cfg.defaultBudget || 10000);

        // Fetch live funds first
        await this.fetchLiveFunds();
        if (this.latestFunds && Number(this.latestFunds.availabelBalance) > 0) {
            maxBudget = Math.min(maxBudget, Number(this.latestFunds.availabelBalance));
        }

        console.log(`🚀 [REAL BROKER ORDER] Triggering Real Trade for ${optionType} | Spot: ₹${signal.entry} | Budget: ₹${maxBudget}`);

        return await trailingSLEngine.executeTrailingTrade({
            spotPrice: signal.entry,
            optionType: optionType,
            maxBudget: maxBudget,
            isPaper: false, // REAL BROKER ORDER!
            signal: signal,
            strategyId: signal.strategyId,
            strategyName: signal.strategyName
        });
    }

    /**
     * Close Active Real Position
     */
    async closeRealPosition(reason = "MANUAL_EXIT", exitLtp = null) {
        return await trailingSLEngine.closeTrailingPosition(reason, exitLtp);
    }

    /**
     * Get Complete State Payload for UI Rendering
     */
    getStatus() {
        const cfg = realConfig.getConfig();
        const trailingStatus = trailingSLEngine.getStatus();

        // Refresh funds if older than 10 seconds
        if (Date.now() - this.lastFundsFetch > 10000) {
            this.fetchLiveFunds().catch(() => {});
        }

        return {
            enabled: cfg.realTradeEnabled,
            selectedStock: cfg.selectedStock,
            funds: this.latestFunds || {
                dhanClientId: "1101323815",
                availabelBalance: 679.52,
                sodLimit: 679.52,
                utilizedAmount: 0,
                withdrawableBalance: 679.52
            },
            totalPnl: trailingStatus.totalPnl || 0,
            totalTrades: trailingStatus.totalTrades || 0,
            winningTrades: trailingStatus.winningTrades || 0,
            losingTrades: trailingStatus.losingTrades || 0,
            winrate: trailingStatus.winrate || "0%",
            activePosition: trailingStatus.activePosition,
            history: trailingStatus.history
        };
    }
}

module.exports = new RealTradeEngine();
