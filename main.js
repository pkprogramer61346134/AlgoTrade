/**
 * AlgoTrade Master Control Loop (main.js)
 * Location: C:\AlgoTrade\main.js
 *
 * Integrated Components:
 * 1. Master System Config (`server/main_config.json` via `config_manager.js`) — single source of truth
 * 2. Time-based 15-minute Candle Evaluator using `getCandlesBefore`
 * 3. Strategy Consensus Engine (`utility/usedfull/Engines/consensusEngine.js`)
 * 4. MasterSL Real Trading Engine (`server/masterSL.js`)
 * 5. UI Dashboard Server (`server/ui_server.js`)
 *
 * Startup Gate:
 *   - Dhan token generation को maximum 10 बार retry करता है
 *   - 10 बार में भी fail → process.exit(1)
 *   - Token मिलने के बाद ही UI / live tick / consensus loop शुरू होते हैं
 */

const mainConfig = require('./server/config_manager');
const masterSL = require('./server/masterSL');
const { evaluateConsensusEngine } = require('./utility/usedfull/Engines/consensusEngine');
const { createUIServer } = require('./server/ui_server');
const { ensureValidDhanToken } = require('./utility/token/autoTokenRefresh');

const INTERVAL_MINUTES = 15;
const UI_PORT = 3000;
const MAX_ORDER_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// Token generation retry settings
const MAX_TOKEN_ATTEMPTS = 10;
const TOKEN_RETRY_DELAY_MS = 3000;

let latestLivePrice = 0;
let latestTickTime = null;
let isEvaluating = false;
let cycleTimer = null;

let latestConsensusResult = {
    consensus: "NO_SIGNAL",
    type: "NO_SIGNAL",
    entry: null,
    sl: null,
    tr: null,
    confidence: "0%",
    strategyName: "Waiting for 15-Min Cycle...",
    strategyStates: []
};

let latestCycleInfo = { date: "--", time: "--" };

let uiServerInstance = null;

// ==========================================================
//  TOKEN STATUS & SYSTEM HEALTH
// ==========================================================
let tokenStatus = {
    state: "PENDING",           // PENDING | GENERATING | SUCCESS | FAILED
    attempts: 0,
    maxAttempts: MAX_TOKEN_ATTEMPTS,
    message: "Waiting to start...",
    lastAttemptTime: null,
    successTime: null
};

let lastCycleStatus = {
    state: "PENDING",           // PENDING | RUNNING | SUCCESS | ERROR
    message: "No cycle yet",
    time: null
};

// Process-Level Global Crash Protection Handlers
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [PROCESS GUARD] Intercepted Unhandled Promise Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
    console.error('💥 [PROCESS GUARD] Intercepted Uncaught Exception:', err?.message || err);
});

/**
 * Start UI Dashboard Server.
 */
function startUIServer(port = UI_PORT) {
    if (!uiServerInstance) {
        uiServerInstance = createUIServer(port, getLiveMarketData);
        console.log(`🌐 [UI] Dashboard active at http://localhost:${port}`);
    }
}

/**
 * Canonical dashboard payload.
 */
function getLiveMarketData() {
    const mainCandle = latestConsensusResult?.evaluatedCandle
        || latestConsensusResult?.candle
        || latestConsensusResult?.lastCandle
        || null;

    const effectiveLivePrice = latestLivePrice > 0
        ? latestLivePrice
        : Number(mainCandle?.close || 0);

    const masterStat = masterSL.getStatus();
    const uiRunning = Boolean(uiServerInstance);
    const liveTickRunning = Boolean(livePriceTracker);
    const consensusLoopRunning = Boolean(cycleTimer);

    return {
        cycle: {
            date: latestCycleInfo.date,
            time: latestCycleInfo.time,
            isEvaluating,
            status: lastCycleStatus
        },
        realTradeEnabled: Boolean(mainConfig.getConfig().realTradeEnabled),
        consensus: latestConsensusResult,
        masterSL: masterStat,

        // System Health & Token Status
        tokenStatus: tokenStatus,
        health: {
            uiServer: uiRunning,
            liveTick: liveTickRunning,
            consensusLoop: consensusLoopRunning,
            uiPort: UI_PORT,
            startedAt: tokenStatus.successTime || null
        }
    };
}

/* ==========================================================
 *  ORDER RETRY HELPERS
 * ========================================================== */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isOrderSuccessful(result) {
    if (!result || typeof result !== 'object') return false;
    return String(result.status || '').toLowerCase() === 'success';
}

function isOrderIgnored(result) {
    if (!result || typeof result !== 'object') return false;
    return String(result.status || '').toLowerCase() === 'ignored';
}

/**
 * Retry up to MAX_ORDER_ATTEMPTS times on failure.
 */
async function processSignalWithRetry(signal, scrip) {
    for (let attempt = 1; attempt <= MAX_ORDER_ATTEMPTS; attempt++) {
        console.log(`📤 [MASTER SL] Attempt ${attempt}/${MAX_ORDER_ATTEMPTS} | Signal: ${signal.consensus}`);

        let result;
        try {
            result = await masterSL.processSignal(signal, scrip);
        } catch (err) {
            console.error(`❌ [ORDER ERROR] Attempt ${attempt}/${MAX_ORDER_ATTEMPTS}:`, err.message);
            if (attempt < MAX_ORDER_ATTEMPTS) await sleep(RETRY_DELAY_MS);
            continue;
        }

        if (isOrderSuccessful(result)) {
            console.log(`✅ [ORDER SUCCESS] Attempt ${attempt}/${MAX_ORDER_ATTEMPTS}`);
            return { success: true, attempts: attempt, result };
        }

        if (isOrderIgnored(result)) {
            console.log(`⏭️ [ORDER IGNORED] Attempt ${attempt} | Reason: ${result.reason || 'ignored'} — stopping.`);
            return { success: false, ignored: true, attempts: attempt, result };
        }

        console.error(
            `❌ [ORDER FAILED] Attempt ${attempt}/${MAX_ORDER_ATTEMPTS}:`,
            result?.message || result?.status || 'Unknown error'
        );

        if (attempt < MAX_ORDER_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }

    console.error(
        `🛑 [MAX RETRIES EXHAUSTED] All ${MAX_ORDER_ATTEMPTS} attempts failed. ` +
        `This cycle will end; next scheduled cycle will continue normally.`
    );
    return { success: false, attempts: MAX_ORDER_ATTEMPTS };
}

/* ==========================================================
 *  TOKEN GENERATION WITH RETRY (max 10 attempts)
 * ========================================================== */

async function ensureTokenWithRetry() {
    console.log(`🔑 [TOKEN GATE] Ensuring valid Dhan token (max ${MAX_TOKEN_ATTEMPTS} attempts)...`);

    tokenStatus.state = "GENERATING";
    tokenStatus.attempts = 0;
    tokenStatus.message = `Starting token generation (max ${MAX_TOKEN_ATTEMPTS} attempts)...`;
    tokenStatus.lastAttemptTime = null;
    tokenStatus.successTime = null;

    for (let attempt = 1; attempt <= MAX_TOKEN_ATTEMPTS; attempt++) {
        tokenStatus.attempts = attempt;
        tokenStatus.lastAttemptTime = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

        try {
            console.log(`\n🔁 [TOKEN ATTEMPT ${attempt}/${MAX_TOKEN_ATTEMPTS}]`);
            tokenStatus.message = `Attempt ${attempt}/${MAX_TOKEN_ATTEMPTS}: Generating...`;
            await ensureValidDhanToken();

            console.log(`✅ [TOKEN SUCCESS] Valid Dhan token obtained on attempt ${attempt}.`);
            tokenStatus.state = "SUCCESS";
            tokenStatus.message = `Token generated successfully on attempt ${attempt}/${MAX_TOKEN_ATTEMPTS}`;
            tokenStatus.successTime = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
            return true;
        } catch (err) {
            console.error(`❌ [TOKEN FAILED] Attempt ${attempt}/${MAX_TOKEN_ATTEMPTS}:`, err.message);
            tokenStatus.message = `Attempt ${attempt} failed: ${err.message}`;

            if (attempt < MAX_TOKEN_ATTEMPTS) {
                console.log(`⏳ Waiting ${TOKEN_RETRY_DELAY_MS / 1000}s before next attempt...`);
                await sleep(TOKEN_RETRY_DELAY_MS);
            }
        }
    }

    console.error(`\n🛑 [TOKEN RETRIES EXHAUSTED] All ${MAX_TOKEN_ATTEMPTS} token generation attempts failed.`);
    tokenStatus.state = "FAILED";
    tokenStatus.message = `All ${MAX_TOKEN_ATTEMPTS} attempts failed. Process will exit.`;
    return false;
}

/* ==========================================================
 *  15-MINUTE EVALUATION
 * ========================================================== */

async function runFifteenMinuteEvaluation() {
    if (isEvaluating) {
        console.warn('⚠️ [CYCLE SKIPPED] Previous evaluation still running.');
        return;
    }
    isEvaluating = true;

    try {
        const cfg = mainConfig.getConfig();
        const scrip = cfg.selectedStock || {
            securityId: "13",
            exchangeSegment: "IDX_I",
            symbol: "NIFTY",
            instrument: "INDEX",
            interval: "15"
        };

        const now = new Date();
        const currentDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const currentTimeStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

        latestCycleInfo = { date: currentDateStr, time: currentTimeStr };

        lastCycleStatus.state = "RUNNING";
        lastCycleStatus.message = `Evaluating at ${currentDateStr} ${currentTimeStr}...`;
        lastCycleStatus.time = `${currentDateStr} ${currentTimeStr}`;

        console.log(`\n--------------------------------------------------------------------------`);
        console.log(`⏰ [15-MIN CYCLE] ${currentDateStr} ${currentTimeStr}`);
        console.log(`📊 [SCRIP] ${scrip.symbol || scrip.securityId} | Interval: ${INTERVAL_MINUTES}m`);

        const consensusResult = await evaluateConsensusEngine({
            securityId: String(scrip.securityId),
            exchangeSegment: scrip.exchangeSegment,
            interval: String(INTERVAL_MINUTES),
            date: currentDateStr,
            time: currentTimeStr
        });

        latestConsensusResult = consensusResult || latestConsensusResult;

        if (consensusResult && consensusResult.lastCandle) {
            const lc = consensusResult.lastCandle;
            latestLivePrice = Number(lc.close || lc.price || 0);
            latestTickTime = `${lc.date} ${lc.time}`;
            console.log(`📊 [MARKET DATA] Latest Candle: ${latestTickTime} | Close: ₹${latestLivePrice}`);
        }

        console.log(`🧠 [CONSENSUS] ${consensusResult.consensus} | Strategy: ${consensusResult.strategyName || 'None'} | Entry: ₹${consensusResult.entry || 0}`);

        lastCycleStatus.state = "SUCCESS";
        lastCycleStatus.message = `Last cycle: ${consensusResult.consensus || 'NO_SIGNAL'}`;

        if (!cfg.realTradeEnabled) {
            console.log('⏸️ [TRADING DISABLED] Signal will not be submitted.');
            return;
        }

        if (consensusResult.consensus !== "BUY" && consensusResult.consensus !== "SELL") {
            console.log('ℹ️ [NO SIGNAL] Waiting for next cycle.');
            return;
        }

        console.log(`🚀 [HEAD CONSENSUS APPROVED] Forwarding ${consensusResult.consensus} to MasterSL (with retry)...`);
        await processSignalWithRetry(consensusResult, scrip);

    } catch (err) {
        console.error("❌ [CYCLE ERROR]:", err.message);
        lastCycleStatus.state = "ERROR";
        lastCycleStatus.message = `Cycle error: ${err.message}`;
    } finally {
        isEvaluating = false;
        console.log('🔓 [CYCLE RELEASED] Ready for next scheduled cycle.');
    }
}

/**
 * Schedule clock-aligned 15-minute loop.
 */
function scheduleClockAlignedLoop(intervalMins = INTERVAL_MINUTES) {
    const getMsToNextBoundary = () => {
        const now = new Date();
        const mins = now.getMinutes();
        const secs = now.getSeconds();
        const ms = now.getMilliseconds();

        const nextMin = (Math.floor(mins / intervalMins) + 1) * intervalMins;
        const diffMins = nextMin - mins;
        const totalMsToTarget = (diffMins * 60 - secs + 2) * 1000 - ms;
        return totalMsToTarget > 0 ? totalMsToTarget : (intervalMins * 60 * 1000);
    };

    const runCycleAndScheduleNext = async () => {
        await runFifteenMinuteEvaluation();

        const msToNext = getMsToNextBoundary();
        const nextTimeStr = new Date(Date.now() + msToNext).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
        console.log(`⏳ Next 15-min cycle scheduled at ~${nextTimeStr} (in ${Math.round(msToNext / 1000)}s)...`);

        if (cycleTimer) clearTimeout(cycleTimer);
        cycleTimer = setTimeout(runCycleAndScheduleNext, msToNext);
    };

    runCycleAndScheduleNext();
}

/**
 * Optional live tick stream.
 */
let livePriceTracker = null;

function startLiveTickStream() {
    try {
        const { DhanLivePrice } = require('./utility/dhan-live-price');
        const cfg = mainConfig.getConfig();
        const scrip = cfg.selectedStock || {
            securityId: "13",
            exchangeSegment: "IDX_I",
            symbol: "NIFTY",
            instrument: "INDEX",
            interval: "15"
        };

        livePriceTracker = new DhanLivePrice();
        livePriceTracker.getLivePrice(
            String(scrip.securityId || "13"),
            scrip.exchangeSegment || "IDX_I",
            Number(INTERVAL_MINUTES),
            (tickData) => {
                if (tickData && tickData.price > 0) {
                    latestLivePrice = Number(tickData.price);
                    latestTickTime = `${tickData.date || ''} ${tickData.time || ''}`.trim();
                }
            },
            scrip.instrument || "INDEX"
        );
        console.log(`📡 [LIVE TICK STREAM ONLINE] ${scrip.symbol} (${scrip.securityId})`);
    } catch (err) {
        console.warn(`⚠️ [LIVE TICK STREAM NOTICE]: ${err.message}`);
    }
}

/**
 * Start the Master System.
 */
async function startMasterSystem() {
    console.log("==========================================================================");
    console.log("🚀 ALGOTRADE MASTER CONTROL SYSTEM (15-MIN CLOCK-ALIGNED LOOP)");
    console.log("==========================================================================");

    // =========================================================
    // STEP 1: TOKEN GENERATION (HARD GATE — max 10 retries)
    // =========================================================
    const tokenOk = await ensureTokenWithRetry();

    if (!tokenOk) {
        console.error("\n==========================================================================");
        console.error("⛔ [FATAL] Cannot obtain valid Dhan token after 10 attempts.");
        console.error("   → No API calls, no consensus loop, no UI will start.");
        console.error("   → Fix the Dhan token issue and restart the process.");
        console.error("==========================================================================\n");
        process.exit(1);
    }

    // =========================================================
    // STEP 2: NOW SAFE TO START EVERYTHING
    // =========================================================
    startLiveTickStream();

    const cfg = mainConfig.getConfig();
    const scrip = cfg.selectedStock || {
        securityId: "13",
        exchangeSegment: "IDX_I",
        symbol: "NIFTY",
        instrument: "INDEX",
        interval: "15"
    };

    // 1. Start UI Server
    startUIServer(UI_PORT);

    // 2. Start clock-aligned 15-min loop
    console.log(`⏱️ Starting clock-aligned 15-minute consensus loop for ${scrip.symbol} (${scrip.securityId})...\n`);
    scheduleClockAlignedLoop(INTERVAL_MINUTES);
}

startMasterSystem();

module.exports = {
    startMasterSystem,
    getLiveMarketData,
    runFifteenMinuteEvaluation,
    mainConfig,
    masterSL
};