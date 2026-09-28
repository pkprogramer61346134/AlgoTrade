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

let latestLivePrice = 0;
let latestTickTime = null;
let isProcessingLiveTick = false;
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

// Process-Level Global Crash Protection Handlers (Prevents system crash on unexpected network/API errors)
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [PROCESS GUARD] Intercepted Unhandled Promise Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
    console.error('💥 [PROCESS GUARD] Intercepted Uncaught Exception:', err?.message || err);
});

console.log("==========================================================================");
console.log("🚀 ALGOTRADE MASTER CONTROL SYSTEM (main.js)");
console.log("==========================================================================");

const { getCachedCandles } = require('./utility/usedfull/cached-historical-data');

async function startMasterSystem() {
    console.log("🔑 [DHAN AUTH] Checking & Ensuring Valid Dhan Access Token via TOTP...");
    try {
        await ensureValidDhanToken();
    } catch (authErr) {
        console.warn(`⚠️ [DHAN AUTH WARN] Auto token refresh notice: ${authErr.message}`);
    }

    const cfg = mainConfig.getConfig();
    const scrip = cfg.selectedStock || { securityId: "13", exchangeSegment: "IDX_I", symbol: "NIFTY", instrument: "INDEX", interval: "5" };

    // Fetch initial market spot price and live funds on startup
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

    const tracker = new DhanLivePrice();

    console.log(`📡 [LIVE STREAM] Starting Central Feed for ${scrip.symbol} (${scrip.securityId})...`);

    tracker.getLivePrice(
        scrip.securityId,
        scrip.exchangeSegment,
        Number(scrip.interval || 5),
        async (tick) => {
            if (isProcessingLiveTick) return;
            isProcessingLiveTick = true;
            try {
                // Update live market payload for UI Server
                latestLivePrice = Number(tick.price || 0);
                latestTickTime = `${tick.date || ''} ${tick.time || ''}`;

                // 3. Evaluate Consensus Engine on live tick (reads warmupCount, minVotes, confirmWaitMinutes from consensus_master_head.json)
                const consensusResult = await evaluateConsensusEngine(tick, -1, {
                    securityId: String(scrip.securityId),
                    exchangeSegment: scrip.exchangeSegment,
                    interval: String(scrip.interval || "5")
                });

                latestConsensusResult = consensusResult;

                // 4. Process Signal in Real Trading Engine
                if (mainConfig.getConfig().realTradeEnabled) {
                    await realTradeEngine.processSignal(consensusResult, scrip);
                }

                // 5. Live Console Strategy Monitor
                let signalBadge = "⚪ NO SIGNAL / WAITING";
                let waitTimerLine = "";

                if (consensusResult.consensus === "BUY") signalBadge = "🟢 BUY SIGNAL CONFIRMED & TRIGGERED";
                if (consensusResult.consensus === "SELL") signalBadge = "🔴 SELL SIGNAL CONFIRMED & TRIGGERED";
                if (consensusResult.consensus === "SYSTEM_STABILIZING") {
                    const remSecs = consensusResult.stabilization?.remainingSecs || 0;
                    const totalSecs = consensusResult.stabilization?.gracePeriodSecs || 45;
                    const rawDir = consensusResult.rawType === "BUY" ? "🟢 BUY" : "🔴 SELL";
                    signalBadge = `⏳ SYSTEM STABILIZING [${rawDir}] (${remSecs}s / ${totalSecs}s Grace Period)`;
                    waitTimerLine = `⏳ Grace Period : ${remSecs}s Remaining (Live Feed & Indicator Synchronization)`;
                }
                if (consensusResult.consensus === "BUILDING_CONFIDENCE") {
                    const rawDir = consensusResult.rawType === "BUY" ? "🟢 BUY" : "🔴 SELL";
                    const currConf = consensusResult.confidence || '0%';
                    const reqThreshold = consensusResult.alignment?.threshold || '75%';
                    signalBadge = `📈 BUILDING CONFIDENCE [${rawDir}] (${currConf} / ${reqThreshold} Peak Required)`;
                }
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
                console.log(`💪 Confidence    : ${consensusResult.confidence || '0%'} (Min Threshold: ${consensusResult.alignment?.threshold || '75%'})`);
                if (consensusResult.alignment && consensusResult.alignment.status !== "NO_ACTIVE_TRADE") {
                    console.log(`🧭 Trade Alignment: ${consensusResult.alignment.note}`);
                }
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
                console.log("🌐 Chrome Dashboard UI Active at : http://localhost:3000");

            } catch (err) {
                console.error("❌ Consensus Engine Error:", err.message);
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
