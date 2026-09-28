/**
 * AlgoTrade Master Control Loop (main.js)
 * Location: C:\AlgoTrade\main.js
 * 
 * Integrated Components:
 * 1. Master System Config (`server/main_config.json` via `config_manager.js`)
 * 2. Dhan Live Price Feed (`utility/dhan-live-price.js`)
 * 3. Strategy Consensus Engine (`utility/usedfull/Engines/consensusEngine.js`)
 * 4. Real Trading Engine (`server/realtread/realtread.js`)
 * 5. UI Dashboard Server (`server/ui_server.js`)
 */

const mainConfig = require('./server/config_manager');
const realTradeEngine = require('./server/realtread/realtread');
const { DhanLivePrice } = require('./utility/dhan-live-price');
const { evaluateConsensusEngine } = require('./utility/usedfull/Engines/consensusEngine');
const { createUIServer } = require('./server/ui_server');
const { ensureValidDhanToken } = require('./utility/token/autoTokenRefresh');
const { getCachedCandles } = require('./utility/usedfull/cached-historical-data');

let latestLivePrice = 0;
let latestTickTime = null;
let isProcessingLiveTick = false;
let lastEvaluatedCandleKey = null;

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

let uiServerInstance = null;

function startUIServer(port = 3000) {
    if (!uiServerInstance) {
        uiServerInstance = createUIServer(port);
    }
}

function getLiveMarketData() {
    return {
        livePrice: latestLivePrice,
        tickTime: latestTickTime,
        consensus: latestConsensusResult,
        config: mainConfig.getConfig(),
        realStatus: realTradeEngine.getStatus()
    };
}

/**
 * Helper: Calculate standard timeframe candle window start time (e.g. 5m / 15m intervals)
 */
function getCandleTimeWindow(timeStr, intervalMins = 5) {
    if (!timeStr) return "00:00:00";
    const cleanStr = String(timeStr).replace(/(am|pm)/gi, "").trim();
    const parts = cleanStr.split(":");
    if (parts.length < 2) return timeStr;
    const hrs = parseInt(parts[0], 10) || 0;
    const mins = parseInt(parts[1], 10) || 0;
    const interval = Number(intervalMins) || 5;
    const windowMins = Math.floor(mins / interval) * interval;
    return `${String(hrs).padStart(2, '0')}:${String(windowMins).padStart(2, '0')}:00`;
}

// Process-Level Global Crash Protection Handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [PROCESS GUARD] Intercepted Unhandled Promise Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
    console.error('💥 [PROCESS GUARD] Intercepted Uncaught Exception:', err?.message || err);
});

async function startMasterSystem() {
    console.log("==========================================================================");
    console.log("🚀 ALGOTRADE MASTER CONTROL SYSTEM");
    console.log("==========================================================================");
    console.log("🔑 Checking Dhan Access Token...");

    try {
        await ensureValidDhanToken();
    } catch (authErr) {
        console.warn(`⚠️ [DHAN AUTH WARN] Token refresh notice: ${authErr.message}`);
    }

    const cfg = mainConfig.getConfig();
    const scrip = cfg.selectedStock || { securityId: "13", exchangeSegment: "IDX_I", symbol: "NIFTY", instrument: "INDEX", interval: "5" };
    const intervalMins = Number(scrip.interval || 5);

    try {
        await realTradeEngine.fetchLiveFunds();
        const initCandlesRes = await getCachedCandles({
            securityId: String(scrip.securityId),
            exchangeSegment: scrip.exchangeSegment,
            interval: String(scrip.interval || "5"),
            count: 1
        });
        if (initCandlesRes && initCandlesRes.status === "success" && Array.isArray(initCandlesRes.data) && initCandlesRes.data.length > 0) {
            const lastCandle = initCandlesRes.data[initCandlesRes.data.length - 1];
            latestLivePrice = Number(lastCandle.close || lastCandle.price || 0);
            latestTickTime = `${lastCandle.date || ''} ${lastCandle.time || ''}`;
        }
    } catch (e) {
        console.warn("⚠️ Initial market price fetch notice:", e.message);
    }

    // 1. Initialize Real Trading Engine if enabled
    if (cfg.realTradeEnabled) {
        await realTradeEngine.startRealTrading();
    }

    // 2. Start UI Dashboard Server (http://localhost:3000)
    startUIServer(3000);
    console.log("🌐 Dashboard UI Active at : http://localhost:3000");

    const tracker = new DhanLivePrice();
    console.log(`📡 Live Stream Started for ${scrip.symbol} (${scrip.securityId})...\n`);

    tracker.getLivePrice(
        scrip.securityId,
        scrip.exchangeSegment,
        intervalMins,
        async (tick) => {
            if (isProcessingLiveTick) return;
            isProcessingLiveTick = true;
            try {
                // Update live market payload for UI Server on every tick
                latestLivePrice = Number(tick.price || 0);
                latestTickTime = `${tick.date || ''} ${tick.time || ''}`;

                // Calculate current timeframe candle window (e.g. "09:15:00", "09:20:00")
                const candleTimeWindow = getCandleTimeWindow(tick.time, intervalMins);
                const currentCandleKey = `${tick.date}_${candleTimeWindow}`;

                // Check candle close transition
                const isCandleClosed = Boolean(tick.isCandleClose) || (lastEvaluatedCandleKey && lastEvaluatedCandleKey !== currentCandleKey);

                if (!lastEvaluatedCandleKey) {
                    // Initialize first startup anchor key
                    lastEvaluatedCandleKey = currentCandleKey;
                } else if (isCandleClosed) {
                    lastEvaluatedCandleKey = currentCandleKey;

                    const consensusResult = await evaluateConsensusEngine(tick, -1, {
                        securityId: String(scrip.securityId),
                        exchangeSegment: scrip.exchangeSegment,
                        interval: String(scrip.interval || "5")
                    });

                    latestConsensusResult = consensusResult;

                    // Process Signal in Real Trading Engine ONLY on confirmed Candle Close
                    if (mainConfig.getConfig().realTradeEnabled && (consensusResult.consensus === "BUY" || consensusResult.consensus === "SELL")) {
                        await realTradeEngine.processSignal(consensusResult, scrip);
                    }
                }

            } catch (err) {
                console.error("❌ Live Tick Processing Error:", err.message);
            } finally {
                isProcessingLiveTick = false;
            }
        },
        scrip.instrument || "INDEX"
    );
}

// Auto-start master system
startMasterSystem();

module.exports = {
    startMasterSystem,
    getLiveMarketData,
    mainConfig,
    realTradeEngine
};
