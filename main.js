/**
 * AlgoTrade Master Control Loop (main.js)
 * Location: C:\AlgoTrade\main.js
 * 
 * Integrated Components:
 * 1. Master System Config (`server/main_config.json` via `config_manager.js`)
 * 2. Time-based 5-minute Candle Evaluator using `getCandlesBefore`
 * 3. Strategy Consensus Engine (`utility/usedfull/Engines/consensusEngine.js`)
 * 4. Real Trading Engine (`server/realtread/realtread.js`)
 * 5. UI Dashboard Server (`server/ui_server.js`)
 */

const mainConfig = require('./server/config_manager');
const realTradeEngine = require('./server/realtread/realtread');
const masterSL = require('./server/masterSL/masterSL');
const reversalFilter = require('./server/reversalTest/reversal');
const { evaluateConsensusEngine } = require('./utility/usedfull/Engines/consensusEngine');
const { createUIServer } = require('./server/ui_server');
const { ensureValidDhanToken } = require('./utility/token/autoTokenRefresh');
const { getCandlesBefore } = require('./utility/usedfull/cached-historical-data');

let latestLivePrice = 0;
let latestTickTime = null;
let isEvaluating = false;
let fiveMinIntervalTimer = null;

let latestConsensusResult = {
    consensus: "NO_SIGNAL",
    type: "NO_SIGNAL",
    entry: null,
    sl: null,
    tr: null,
    confidence: "0%",
    strategyName: "Waiting for 5-Min Cycle...",
    strategyStates: []
};

let uiServerInstance = null;

function startUIServer(port = 3000) {
    if (!uiServerInstance) {
        uiServerInstance = createUIServer(port);
    }
}

function getLiveMarketData() {
    const mainCandle = latestConsensusResult?.evaluatedCandle || latestConsensusResult?.candle || latestConsensusResult?.lastCandle || null;
    const effectiveLivePrice = latestLivePrice > 0 ? latestLivePrice : Number(mainCandle?.close || 0);

    return {
        livePrice: effectiveLivePrice,
        tickTime: latestTickTime,
        consensus: latestConsensusResult,
        reversalStatus: reversalFilter.getStatus(),
        masterSLStatus: masterSL.getStatus(),
        candle: mainCandle,
        config: mainConfig.getConfig(),
        realStatus: realTradeEngine.getStatus()
    };
}

// Process-Level Global Crash Protection Handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [PROCESS GUARD] Intercepted Unhandled Promise Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
    console.error('💥 [PROCESS GUARD] Intercepted Uncaught Exception:', err?.message || err);
});

/**
 * Time-based Evaluation Loop:
 * Passes date, time, securityId, exchangeSegment, interval directly to evaluateConsensusEngine.
 * evaluateConsensusEngine automatically uses auto-warmup to fetch 200 candles from cached-historical-data.js.
 */
async function runFiveMinuteEvaluation() {
    if (isEvaluating) return;
    isEvaluating = true;

    try {
        const cfg = mainConfig.getConfig();
        const scrip = cfg.selectedStock || { securityId: "13", exchangeSegment: "IDX_I", symbol: "NIFTY", instrument: "INDEX", interval: "5" };

        const now = new Date();
        const currentDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const currentTimeStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

        console.log(`\n--------------------------------------------------------------------------`);
        console.log(`⏰ [CYCLE TRIGGER] Running Consensus Evaluation at ${currentDateStr} ${currentTimeStr}`);

        // Direct call to evaluateConsensusEngine passing scrip parameters, date and time.
        // Auto-warmup in evaluateConsensusEngine automatically fetches 200 candles from cached-historical-data.js
        const consensusResult = await evaluateConsensusEngine({
            securityId: String(scrip.securityId),
            exchangeSegment: scrip.exchangeSegment,
            interval: String(scrip.interval || "5"),
            date: currentDateStr,
            time: currentTimeStr
        });

        latestConsensusResult = consensusResult;

        if (consensusResult && consensusResult.lastCandle) {
            const lc = consensusResult.lastCandle;
            latestLivePrice = Number(lc.close || lc.price || 0);
            latestTickTime = `${lc.date} ${lc.time}`;
            console.log(`📊 [MARKET DATA] Scrip: ${scrip.symbol || scrip.securityId} | Latest Candle: ${latestTickTime} | Close: ₹${latestLivePrice}`);
        }

        console.log(`🧠 [CONSENSUS RESULT] Consensus: ${consensusResult.consensus} | Strategy: ${consensusResult.strategyName || 'None'} | Entry: ₹${consensusResult.entry || 0}`);

        // Filter signal through Reversal Liquidity Sweep & Retest Filter
        const lastCandle = consensusResult?.lastCandle || consensusResult?.evaluatedCandle || null;
        const confirmedSignal = reversalFilter.evaluateSignal(consensusResult, lastCandle);

        // Process Confirmed Signal in Real Trading Engine if enabled
        if (cfg.realTradeEnabled && confirmedSignal && (confirmedSignal.consensus === "BUY" || confirmedSignal.consensus === "SELL")) {
            console.log(`🚀 [REVERSAL APPROVED] Forwarding confirmed ${confirmedSignal.consensus} signal to Real Trading Engine...`);
            await realTradeEngine.processSignal(confirmedSignal, scrip);
        }
    } catch (err) {
        console.error("❌ [CYCLE ERROR]:", err.message);
    } finally {
        isEvaluating = false;
    }
}

/**
 * Schedules evaluation execution aligned with clock boundaries (e.g. at 11:10:02, 11:15:02, 11:20:02)
 */
function scheduleClockAlignedFiveMinLoop(intervalMins = 5) {
    const getMsToNextBoundary = () => {
        const now = new Date();
        const mins = now.getMinutes();
        const secs = now.getSeconds();
        const ms = now.getMilliseconds();
        
        const nextMin = (Math.floor(mins / intervalMins) + 1) * intervalMins;
        const diffMins = nextMin - mins;
        
        // Target is diffMins minutes ahead, 2 seconds past boundary (to ensure candle is closed)
        const totalMsToTarget = (diffMins * 60 - secs + 2) * 1000 - ms;
        return totalMsToTarget > 0 ? totalMsToTarget : (intervalMins * 60 * 1000);
    };

    const runCycleAndScheduleNext = async () => {
        await runFiveMinuteEvaluation();

        const msToNext = getMsToNextBoundary();
        const nextTimeStr = new Date(Date.now() + msToNext).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
        console.log(`⏳ Next cycle scheduled for ~${nextTimeStr} (in ${Math.round(msToNext / 1000)}s)...`);

        if (fiveMinIntervalTimer) {
            clearTimeout(fiveMinIntervalTimer);
        }
        fiveMinIntervalTimer = setTimeout(runCycleAndScheduleNext, msToNext);
    };

    runCycleAndScheduleNext();
}

const { DhanLivePrice } = require('./utility/dhan-live-price');
let livePriceTracker = null;

function startLiveTickStream() {
    try {
        const cfg = mainConfig.getConfig();
        const scrip = cfg.selectedStock || { securityId: "13", exchangeSegment: "IDX_I", symbol: "NIFTY", instrument: "INDEX", interval: "5" };
        
        livePriceTracker = new DhanLivePrice();
        livePriceTracker.getLivePrice(
            String(scrip.securityId || "13"),
            scrip.exchangeSegment || "IDX_I",
            Number(scrip.interval || 5),
            (tickData) => {
                if (tickData && tickData.price > 0) {
                    latestLivePrice = Number(tickData.price);
                    latestTickTime = `${tickData.date || ''} ${tickData.time || ''}`.trim();
                    // Update Reversal Filter with live Nifty spot ticks!
                    reversalFilter.updateLiveTick(latestLivePrice);
                }
            },
            scrip.instrument || "INDEX"
        );
        console.log(`📡 [LIVE TICK STREAM ONLINE] Dhan WebSocket streaming live price ticks for ${scrip.symbol} (${scrip.securityId}) into Reversal Engine.`);
    } catch (err) {
        console.warn(`⚠️ [LIVE TICK STREAM NOTICE]: ${err.message}`);
    }
}

async function startMasterSystem() {
    console.log("==========================================================================");
    console.log("🚀 ALGOTRADE MASTER CONTROL SYSTEM (REALTIME CLOCK-ALIGNED LOOP)");
    console.log("==========================================================================");
    console.log("🔑 Checking Dhan Access Token...");

    try {
        await ensureValidDhanToken();
    } catch (authErr) {
        console.warn(`⚠️ [DHAN AUTH WARN] Token refresh notice: ${authErr.message}`);
    }

    // Start Realtime Live Tick Stream into Reversal Filter via DhanLivePrice
    startLiveTickStream();

    const cfg = mainConfig.getConfig();
    const scrip = cfg.selectedStock || { securityId: "13", exchangeSegment: "IDX_I", symbol: "NIFTY", instrument: "INDEX", interval: "5" };
    const intervalMins = Number(scrip.interval || 5);

    // 1. Initialize Real Trading Engine if enabled
    if (cfg.realTradeEnabled) {
        await realTradeEngine.startRealTrading();
    }

    // 2. Start UI Dashboard Server (http://localhost:3000)
    startUIServer(3000);
    console.log("🌐 Dashboard UI Active at : http://localhost:3000");

    console.log(`⏱️ Starting clock-aligned ${intervalMins}-minute consensus evaluation loop for ${scrip.symbol} (${scrip.securityId})...\n`);

    // Start clock-aligned evaluation loop
    scheduleClockAlignedFiveMinLoop(intervalMins);
}

// Auto-start master system
startMasterSystem();

module.exports = {
    startMasterSystem,
    getLiveMarketData,
    runFiveMinuteEvaluation,
    mainConfig,
    realTradeEngine
};
