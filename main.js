/**
 * AlgoTrade Master Control Center (main.js)
 * Location: C:\AlgoTrade\main.js
 * 
 * Central Control Hub for:
 * 1. Central Dhan Live Market WebSocket Stream (`DhanLivePrice`).
 * 2. Central Consensus Engine Evaluation (`consensusEngine.js`).
 * 3. Central System Configuration Manager (`server/config_manager.js`).
 * 4. Paper Trading Engine (`server/pepertread/pepertread.js`).
 * 5. Real Trading Engine (`server/realtread/realtread.js`).
 * 6. Realtime Chrome Dashboard UI Server (`server/ui_server.js`).
 */

const mainConfig = require('./server/config_manager');
const paperTradeEngine = require('./server/pepertread/pepertread');
const realTradeEngine = require('./server/realtread/realtread');
const { evaluateConsensusEngine } = require('./utility/usedfull/Engines/consensusEngine');
const { DhanLivePrice } = require('./utility/dhan-live-price');
const { createUIServer } = require('./server/ui_server');

let centralMarketTracker = null;
let uiServerInstance = null;

let latestLivePrice = 0;
let latestTickTime = null;
let latestConsensusResult = {
    consensus: "NO_SIGNAL",
    type: "NO_SIGNAL",
    entry: null,
    sl: null,
    tr: null,
    confidence: "0%",
    strategyName: "Waiting for Live Feed...",
    strategyStates: []
};

console.log("==========================================================================");
console.log("🚀 ALGOTRADE MASTER CONTROL CENTER (main.js)");
console.log("==========================================================================");

/**
 * Start Central Live Market Stream & Central Consensus Evaluation
 */
function startCentralLiveStream(selectedStock = null) {
    const config = mainConfig.getConfig();
    const scrip = selectedStock || config.selectedStock || { securityId: "13", exchangeSegment: "IDX_I", symbol: "NIFTY", instrument: "INDEX", interval: "5" };

    if (centralMarketTracker) {
        try { centralMarketTracker.close(); } catch (e) {}
    }

    console.log(`📡 [CENTRAL STREAM] Starting Central Live Feed & Consensus Engine for ${scrip.symbol} (${scrip.securityId})...`);
    centralMarketTracker = new DhanLivePrice();

    centralMarketTracker.getLivePrice(
        scrip.securityId,
        scrip.exchangeSegment,
        scrip.interval || 5,
        async (tick) => {
            const price = Number(tick.ltp || tick.close || tick.price || 0);
            if (!price || isNaN(price)) return;

            latestLivePrice = price;
            const now = new Date();
            const dateStr = tick.date || now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
            const timeStr = tick.time || now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
            latestTickTime = `${dateStr} ${timeStr}`;

            const liveCandle = {
                securityId: scrip.securityId,
                exchangeSegment: scrip.exchangeSegment,
                interval: scrip.interval || "5",
                date: dateStr,
                time: timeStr,
                close: price
            };

            // 1. Central Evaluation in Consensus Engine
            try {
                const signal = await evaluateConsensusEngine(liveCandle, -1, { warmupCount: 200 });
                latestConsensusResult = signal;

                // 2. Broadcast signal to Paper Trading Engine if ON
                if (mainConfig.getConfig().paperTradeEnabled) {
                    await paperTradeEngine.processSignal(signal, scrip);
                }

                // 3. Broadcast signal to Real Trading Engine if ON
                if (mainConfig.getConfig().realTradeEnabled) {
                    await realTradeEngine.processSignal(signal, scrip);
                }
            } catch (err) {
                console.error(`❌ [CENTRAL CONSENSUS ERROR] ${err.message}`);
            }
        },
        scrip.instrument || "INDEX"
    );
}

/**
 * Start UI Server for Chrome Dashboard
 */
function startUIServer(port = 3000) {
    if (!uiServerInstance) {
        uiServerInstance = createUIServer(port);
    }
}

/**
 * Enable & Start Master Trading System
 */
async function startMasterSystem() {
    console.log("\n▶️ [CONTROL CENTER] Initializing AlgoTrade Master System...");
    const cfg = mainConfig.getConfig();

    if (cfg.paperTradeEnabled) {
        await paperTradeEngine.startPaperTrading();
    }
    if (cfg.realTradeEnabled) {
        await realTradeEngine.startRealTrading();
    }

    startCentralLiveStream(cfg.selectedStock);
    startUIServer(3000);
}

/**
 * Get Realtime Central Market Payload for UI Dashboard
 */
function getLiveMarketData() {
    return {
        livePrice: latestLivePrice,
        tickTime: latestTickTime,
        consensus: latestConsensusResult,
        config: mainConfig.getConfig(),
        paperStatus: paperTradeEngine.getStatus(),
        realStatus: realTradeEngine.getStatus()
    };
}

// Auto-start System if executed directly (node main.js)
if (require.main === module) {
    startMasterSystem();
}

module.exports = {
    startMasterSystem,
    startCentralLiveStream,
    startUIServer,
    getLiveMarketData,
    mainConfig,
    paperTradeEngine,
    realTradeEngine
};
