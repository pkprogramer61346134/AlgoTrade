/**
 * AlgoTrade Master Control Loop (main.js)
 * Location: C:\AlgoTrade\main.js
 *
 * Startup Gate:
 *   1. सबसे पहले `candle_data` folder का content delete होता है (stale cache clean)
 *   2. फिर Dhan token generation (max 10 retries)
 *   3. 10 बार में भी fail → process.exit(1)
 *   4. Token मिलने के बाद ही UI / live tick / consensus loop शुरू होते हैं
 */

const fs = require('fs');
const path = require('path');

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

// Candle cache folder to clear on every startup
const CANDLE_DATA_DIR = path.join(__dirname, 'candle_data');

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
    state: "PENDING",
    attempts: 0,
    maxAttempts: MAX_TOKEN_ATTEMPTS,
    message: "Waiting to start...",
    lastAttemptTime: null,
    successTime: null
};

let lastCycleStatus = {
    state: "PENDING",
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

/* ==========================================================
 *  CANDLE CACHE CLEANUP (on startup)
 * ========================================================== */

/**
 * `candle_data` folder का सारा content delete करो (folder खुद रहेगा)।
 * ये हर startup पर चलेगा ताकि stale cache से कोई गलत signal न हो।
 */
function clearCandleCacheOnStartup() {
    console.log('==========================================================================');
    console.log('🧹 [STARTUP CLEANUP] Clearing candle_data cache...');
    console.log(`   Target: ${CANDLE_DATA_DIR}`);

    try {
        // अगर folder नहीं है, तो बना दो (empty)
        if (!fs.existsSync(CANDLE_DATA_DIR)) {
            fs.mkdirSync(CANDLE_DATA_DIR, { recursive: true });
            console.log('   ✅ Folder was missing — created empty.');
            return;
        }

        const entries = fs.readdirSync(CANDLE_DATA_DIR);
        let deletedFiles = 0;
        let deletedDirs = 0;

        for (const entry of entries) {
            const fullPath = path.join(CANDLE_DATA_DIR, entry);
            try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    deletedDirs++;
                } else {
                    fs.unlinkSync(fullPath);
                    deletedFiles++;
                }
            } catch (err) {
                console.warn(`   ⚠️ Could not delete ${entry}: ${err.message}`);
            }
        }

        console.log(`   ✅ Deleted ${deletedFiles} files, ${deletedDirs} sub-folders.`);
        console.log('==========================================================================\n');
    } catch (err) {
        console.error(`   ❌ [CLEANUP ERROR] Failed to clear candle_data: ${err.message}`);
        console.error('==========================================================================\n');
        // Do not throw — let the system continue (folder may be re-created later)
    }
}

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

    // =========================================================
    // STARTUP BEHAVIOR CHANGE:
    // Startup पर पहला cycle तुरंत नहीं चलेगा।
    // सिर्फ़ अगली 15-min clock boundary पर पहला cycle चलेगा।
    // इससे fresh closed candle मिलेगी और stale signal से trade नहीं होगी।
    // =========================================================
    const msToFirstBoundary = getMsToNextBoundary();
    const firstBoundaryStr = new Date(Date.now() + msToFirstBoundary).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

    console.log(`🕐 [STARTUP DELAY] First cycle will run at next 15-min boundary: ~${firstBoundaryStr} (in ${Math.round(msToFirstBoundary / 1000)}s)`);
    console.log(`   (No immediate evaluation on startup — avoids stale-candle trades)`);

    if (cycleTimer) clearTimeout(cycleTimer);
    cycleTimer = setTimeout(runCycleAndScheduleNext, msToFirstBoundary);
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
 *
 * STEP 0: candle_data cache clear
 * STEP 1: token generation (max 10 retries)
 * STEP 2: start UI / live tick / consensus loop
 */
async function startMasterSystem() {
    console.log("==========================================================================");
    console.log("🚀 ALGOTRADE MASTER CONTROL SYSTEM (15-MIN CLOCK-ALIGNED LOOP)");
    console.log("==========================================================================");

    // =========================================================
    // STEP 0: CLEAR CANDLE CACHE ON STARTUP
    // =========================================================
    clearCandleCacheOnStartup();

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