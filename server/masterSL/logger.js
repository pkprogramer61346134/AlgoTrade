/**
 * Master SL Dedicated Error & Audit Logger
 * Location: C:\AlgoTrade\server\masterSL\logger.js
 * 
 * Logs errors, retry attempts, step failures, and trading audit events
 * directly to master_sl_error.log file with timestamp and context.
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'master_sl_error.log');

class MasterSLLogger {
    /**
     * Format Indian Local Time
     */
    getLocalTimeStr() {
        return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
    }

    /**
     * Rotate log file if it exceeds 10MB to prevent bloated log files
     */
    rotateLogIfNeeded() {
        try {
            if (fs.existsSync(LOG_FILE)) {
                const stats = fs.statSync(LOG_FILE);
                if (stats.size > 10 * 1024 * 1024) { // > 10MB
                    const content = fs.readFileSync(LOG_FILE, 'utf-8');
                    const lines = content.split('\n');
                    const keepLines = lines.slice(-5000).join('\n');
                    fs.writeFileSync(LOG_FILE, `--- LOG ROTATED AT ${this.getLocalTimeStr()} ---\n` + keepLines, 'utf-8');
                }
            }
        } catch (e) {}
    }

    /**
     * Clear / Reset log file contents
     */
    clearLog() {
        try {
            fs.writeFileSync(LOG_FILE, `--- LOG CLEARED AT ${this.getLocalTimeStr()} ---\n`, 'utf-8');
            console.log(`🧹 [LOGGER] Cleared ${LOG_FILE}`);
        } catch (e) {
            console.error(`❌ [LOGGER ERROR] Failed to clear log file: ${e.message}`);
        }
    }

    /**
     * Format and log an error to master_sl_error.log with full diagnostic context
     * 
     * @param {string} envName - Environment ("PAPER_TRADE" | "REAL_TRADE" | "BACKTEST")
     * @param {string} stepName - Step Name (e.g. "CHECK_BALANCE", "SELECT_STRIKE", "PLACE_ORDER", "MODIFY_ORDER_SL", "CLOSE_ORDER")
     * @param {Error|string} error - Error object or message string
     * @param {Object} [metadata] - Full context diagnostic payload
     */
    logError(envName, stepName, error, metadata = {}) {
        this.rotateLogIfNeeded();
        const istTime = this.getLocalTimeStr();
        const isoTime = new Date().toISOString();
        const errMessage = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error && error.stack ? error.stack : '';

        let logEntry = `==========================================================================\n`;
        logEntry += `🚨 [ERROR LOG] Timestamp: ${istTime} (${isoTime}) | Env: [${envName}] | Step: [${stepName}]\n`;
        logEntry += `💥 Message: ${errMessage}\n`;
        if (errStack) {
            logEntry += `📍 Stack Trace:\n${errStack}\n`;
        }
        if (metadata && Object.keys(metadata).length > 0) {
            try {
                logEntry += `📦 Diagnostic Context:\n${JSON.stringify(metadata, null, 2)}\n`;
            } catch (e) {
                logEntry += `📦 Diagnostic Context: [Unserializable Object]\n`;
            }
        }
        logEntry += `==========================================================================\n\n`;

        console.error(`❌ [MASTER SL LOGGER] [${envName}] [${stepName}] ${errMessage}`);

        try {
            fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
        } catch (e) {
            console.error(`⚠️ [MASTER SL LOGGER] Failed to append to ${LOG_FILE}: ${e.message}`);
        }
    }

    /**
     * Log a retry attempt warning with context
     */
    logRetry(envName, stepName, attempt, maxRetries, errorMsg, delayMs) {
        this.rotateLogIfNeeded();
        const istTime = this.getLocalTimeStr();
        const logEntry = `[${istTime}] [${envName}] ⚠️ [RETRY WARN] [STEP: ${stepName}] Attempt ${attempt}/${maxRetries} Failed: ${errorMsg} | Retrying in ${delayMs}ms...\n`;

        console.warn(`⚠️ [MASTER SL RETRY] [${envName}] [${stepName}] Attempt ${attempt}/${maxRetries} failed: ${errorMsg}. Retrying in ${delayMs}ms...`);

        try {
            fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
        } catch (e) {}
    }

    /**
     * Log an audit event (e.g. Entry, Exit, SL Trailed)
     */
    logInfo(envName, action, message) {
        this.rotateLogIfNeeded();
        const istTime = this.getLocalTimeStr();
        const logEntry = `[${istTime}] [${envName}] ℹ️ [${action}] ${message}\n`;

        console.log(`ℹ️ [MASTER SL INFO] [${envName}] [${action}] ${message}`);

        try {
            fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
        } catch (e) {}
    }
}

module.exports = new MasterSLLogger();
