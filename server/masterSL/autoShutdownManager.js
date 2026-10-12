/**
 * Auto Shutdown Manager for Google Cloud VM & Server
 * Location: C:\AlgoTrade\server\masterSL\autoShutdownManager.js
 * 
 * Purpose:
 * When maximum trades per day (e.g. 3 trades) are completed,
 * this manager safely closes the trading server and shuts down
 * the Google Cloud Linux VM (`sudo shutdown -h now`) after a safe
 * grace period.
 * 
 * Safety Rules:
 * 1. NEVER shuts down while an active position is open.
 * 2. Only triggers after trade exit confirmation (`netQty === 0`).
 * 3. Waits 10 seconds grace period to allow all logs and state to write cleanly to disk.
 * 4. Checks OS environment: Executes 'sudo shutdown -h now' on Linux (GCP VM),
 *    while safely skipping OS shutdown on Windows (development workstation).
 */

const { exec } = require('child_process');
const logger = require('./logger');
const masterConfig = require('./config');

class AutoShutdownManager {
    constructor() {
        this.isShutdownInitiated = false;
        this.shutdownTimer = null;
        this.scheduledShutdownTime = null;
        this.todayTradesCount = 0;
    }

    /**
     * Check if daily trades limit reached, and trigger safe system shutdown
     * 
     * @param {Array} tradeHistory - MasterSL trade history array
     * @param {Object|null} activePosition - Current active position
     * @param {Object} cfg - MasterSL configuration
     * @param {string} envName - Environment ("REAL_TRADE" | "PAPER" | "BACKTEST")
     * @returns {boolean} Whether shutdown was initiated
     */
    checkAndTriggerShutdown(tradeHistory = [], activePosition = null, cfg = {}, envName = "REAL_TRADE") {
        // Do not trigger in backtesting environments
        if (envName === "BACKTEST") {
            return false;
        }

        const activeCfg = (cfg && typeof cfg === 'object' && Object.keys(cfg).length > 0) 
            ? cfg 
            : masterConfig.getConfig();

        // Debounce: Trigger only once per day
        if (this.isShutdownInitiated) {
            return false;
        }

        // CRITICAL SAFETY GUARD: Never shutdown while an active position is open or exiting
        if (activePosition && (activePosition.status === "OPEN" || activePosition.status === "EXIT_FAILED" || activePosition.isCloseInFlight)) {
            console.log(`⚠️ [AUTO SHUTDOWN GUARD] Active position still present (${activePosition.symbol || 'OPEN'}). Shutdown skipped.`);
            return false;
        }

        // Count completed trades for today (strictly Indian Market trading date)
        const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const todayCompletedTrades = (Array.isArray(tradeHistory) ? tradeHistory : []).filter(t => 
            (t.entryDate === todayDate || t.date === todayDate) && t.status === "CLOSED"
        );

        this.todayTradesCount = todayCompletedTrades.length;
        const maxTrades = Number(activeCfg?.maxTradesPerDay || 3);
        const isEnabled = activeCfg?.autoShutdownOnMaxTrades !== false;

        // Check if trade quota reached
        if (isEnabled && this.todayTradesCount >= maxTrades) {
            this.isShutdownInitiated = true;
            const graceDelayMs = Number(activeCfg?.shutdownGraceDelayMs || 10000); // 10 seconds default
            this.scheduledShutdownTime = Date.now() + graceDelayMs;

            const shutdownMsg = `🛑 [DAILY QUOTA REACHED] ${this.todayTradesCount} trades completed today (${this.todayTradesCount}/${maxTrades}). Initiating safe Server & VM shutdown in ${graceDelayMs / 1000} seconds...`;
            console.log(`\n==========================================================================`);
            console.log(shutdownMsg);
            console.log(`==========================================================================\n`);

            logger.logInfo(envName, "AUTO_SHUTDOWN_SCHEDULED", shutdownMsg);

            this.shutdownTimer = setTimeout(() => {
                this.executeSystemShutdown(envName);
            }, graceDelayMs);

            return true;
        }

        return false;
    }

    /**
     * Executes OS / Server shutdown safely based on operating platform
     */
    executeSystemShutdown(envName = "REAL_TRADE") {
        const isLinux = process.platform === 'linux';

        if (isLinux && envName === "REAL_TRADE") {
            // Google Cloud Linux VM: Execute graceful OS poweroff
            const logMsg = `🛑 [VM SHUTDOWN EXECUTING] Google Cloud Linux VM detected in REAL_TRADE. Executing 'sudo shutdown -h now' to power off VM and stop billing...`;
            console.log(logMsg);
            logger.logInfo(envName, "VM_SHUTDOWN_EXECUTED", logMsg);

            exec("sudo shutdown -h now", (err, stdout, stderr) => {
                if (err) {
                    const errMsg = `❌ [SHUTDOWN COMMAND FAILED] 'sudo shutdown -h now' failed: ${err.message}. Falling back to PM2 process stop...`;
                    console.error(errMsg);
                    logger.logError(envName, "VM_SHUTDOWN_FAILED", err);

                    // Fallback: stop PM2 so trading bot stops running
                    exec("pm2 stop algotrade || pm2 stop all", () => {
                        process.exit(0);
                    });
                }
            });
        } else if (isLinux) {
            // Linux in non-REAL_TRADE mode (simulation/testing)
            const noticeMsg = `ℹ️ [AUTO SHUTDOWN NOTICE] Daily quota reached in ${envName} mode. OS poweroff skipped for non-live trading.`;
            console.log(noticeMsg);
            logger.logInfo(envName, "AUTO_SHUTDOWN_TEST_NOTICE", noticeMsg);
        } else {
            // Windows Dev Machine: Do not power off user's computer; log notification safely
            const winMsg = `ℹ️ [AUTO SHUTDOWN NOTICE] ${this.todayTradesCount} daily trades completed. On Google Cloud Linux VM, 'sudo shutdown -h now' will execute. On Windows workstation, OS shutdown is skipped to protect your desktop.`;
            console.log(winMsg);
            logger.logInfo(envName, "AUTO_SHUTDOWN_WINDOWS_NOTICE", winMsg);
        }
    }

    /**
     * Cancel scheduled shutdown (if manual reset needed)
     */
    cancelShutdown() {
        if (this.shutdownTimer) {
            clearTimeout(this.shutdownTimer);
            this.shutdownTimer = null;
        }
        this.isShutdownInitiated = false;
        this.scheduledShutdownTime = null;
        console.log("🔄 [AUTO SHUTDOWN] Scheduled shutdown was cancelled.");
    }

    /**
     * Get Shutdown Status for UI / Monitoring
     */
    getStatus() {
        const remainingMs = this.scheduledShutdownTime ? Math.max(0, this.scheduledShutdownTime - Date.now()) : 0;
        return {
            isShutdownInitiated: this.isShutdownInitiated,
            scheduledShutdownTime: this.scheduledShutdownTime,
            remainingShutdownSecs: Math.ceil(remainingMs / 1000),
            todayTradesCount: this.todayTradesCount
        };
    }
}

module.exports = new AutoShutdownManager();
