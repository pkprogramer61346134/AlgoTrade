const { candleDataHub } = require('./candleDataHub');
const { evaluateConsensusEngine } = require('./consensusEngine');
const { prepareJSONStrategyData, evaluateJSONStrategy } = require('./dynamicStrategyEngine');
const OrderExecutionManager = require('../order_config/orderExecutionManager');
const SpotRiskDeltaCalculator = require('./spotRiskDeltaCalculator');
const LiquiditySweepStrategy = require('./liquiditySweepStrategy');

/**
 * SYSTEM HIGHWAY ROUTER (Unified Trading Pipeline)
 * 
 * Connects all core modules onto a single, high-performance Data & Execution Highway:
 * 
 *   [Candle Feed] ──► [Candle Data Hub] ──► [Master Head Consensus Engine] ──► [SpotRiskDeltaCalculator] ──► [Order Execution Manager]
 *                                                                                                                │
 *                                                      ┌─────────────────────────────────────────────────────────┼─────────────────────────────┐
 *                                                      ▼                                                         ▼                             ▼
 *                                             [BACKTEST ENGINE]                                         [PAPER TRADE MANAGER]         [REAL TRADE MANAGER]
 */
class SystemHighwayRouter {
    constructor(dhanInstance = null) {
        this.orderManager = new OrderExecutionManager(dhanInstance);
        this.candleDataHub = candleDataHub;
        this.spotRiskCalculator = SpotRiskDeltaCalculator;
        if (dhanInstance) {
            this.candleDataHub.setDhanInstance(dhanInstance);
        }
    }

    /**
     * Process a single incoming candle tick through the Highway Pipeline
     * @param {Array} candles - Candle history array
     * @param {number} currentIndex - Index of current candle being evaluated
     * @param {Object} stratConfig - Strategy configuration JSON
     * @param {Object} dailyTradeCounts - Map of daily trade counts
     * @param {boolean} ignoreMaxTradesCap - Flag to bypass daily trade limit (e.g. for Backtest)
     */
    processCandleTick(candles, currentIndex, stratConfig, dailyTradeCounts = {}, ignoreMaxTradesCap = false) {
        // 1. Prepare Indicator Data via Candle Data Hub / Indicator Utilities
        const data = prepareJSONStrategyData(candles, stratConfig);

        // 2. Pass current candle to Master Head Consensus Engine for Entry Signal Evaluation
        const evalResult = evaluateJSONStrategy(candles, currentIndex, stratConfig, data, dailyTradeCounts, ignoreMaxTradesCap);

        return {
            candle: candles[currentIndex],
            evalResult,
            data
        };
    }

    /**
     * Run Backtest via Highway Pipeline
     */
    async runBacktestHighway(startDate = null, endDate = null, stratConfig = null, initialCapital = 100000) {
        // 1. Fetch candles + 300 warmup candles from Candle Data Hub
        const runCandles = await this.candleDataHub.getCandlesWithWarmup(startDate, endDate, 300);
        
        const effectiveConfig = stratConfig || {
            id: "consensus_master_head",
            name: "👑 Master Head Consensus Engine",
            riskRewardRatio: 3.0
        };

        // 2. Execute backtest using Order Execution Manager & Backtest Engine
        const report = this.orderManager.runBacktest(runCandles, effectiveConfig, initialCapital, 100);

        // 3. Filter trades to requested date window
        if (startDate || endDate) {
            const windowTrades = report.trades.filter(t => {
                if (startDate && endDate) return t.date >= startDate && t.date <= endDate;
                if (startDate) return t.date === startDate;
                return true;
            });

            return {
                ...report,
                trades: windowTrades,
                totalTrades: windowTrades.length
            };
        }

        return report;
    }

    /**
     * Process Live Market Tick via Highway Pipeline
     */
    async processLiveTickHighway(candleTick, liveOptionPremium = null) {
        const mode = this.orderManager.config.executionMode || "PAPER";
        
        // Monitor active position exit conditions (SL, Target, EOD)
        const positionStatus = this.orderManager.monitorActivePosition(candleTick.close, liveOptionPremium);
        
        return {
            mode,
            activeOrder: this.orderManager.activeOrder,
            positionStatus
        };
    }
}

module.exports = SystemHighwayRouter;
