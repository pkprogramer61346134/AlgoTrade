/**
 * Reversal Signal Filter Dedicated Error & Audit Logger
 * Location: C:\AlgoTrade\server\reversalTest\logger.js
 * 
 * Logs reversal filter state transitions, liquidity sweep detections, 
 * signal confirmations, lock events, and errors to reversal_filter.log
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'reversal_filter.log');

class ReversalLogger {
    /**
     * Format Indian Local Time (Asia/Kolkata)
     */
    getLocalTimeStr() {
        return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
    }

    /**
     * Rotate log file if it exceeds 10MB to prevent bloated files
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
            console.log(`🧹 [REVERSAL LOGGER] Cleared ${LOG_FILE}`);
        } catch (e) {
            console.error(`❌ [REVERSAL LOGGER ERROR] Failed to clear log file: ${e.message}`);
        }
    }

    /**
     * Log informational state events and status updates
     * @param {string} stepName Event identifier (e.g. "WATCH_STARTED", "SWEEP_DETECTED", "REVERSAL_CONFIRMED")
     * @param {string} message Descriptive log message
     * @param {Object} [metadata] Diagnostic context object
     */
    logInfo(stepName, message, metadata = {}) {
        this.rotateLogIfNeeded();
        const istTime = this.getLocalTimeStr();

        let logEntry = `[${istTime}] [INFO] [${stepName}] ${message}\n`;
        if (metadata && Object.keys(metadata).length > 0) {
            logEntry += `   Payload: ${JSON.stringify(metadata)}\n`;
        }

        try {
            fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
        } catch (e) {
            console.error(`❌ [REVERSAL LOGGER ERROR] Failed to write log: ${e.message}`);
        }
    }

    /**
     * Log error events with diagnostic context & stack traces
     * @param {string} stepName Step or error context name
     * @param {Error|string} error Error object or message
     * @param {Object} [metadata] Additional payload
     */
    logError(stepName, error, metadata = {}) {
        this.rotateLogIfNeeded();
        const istTime = this.getLocalTimeStr();
        const errMessage = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error && error.stack ? error.stack : '';

        let logEntry = `==========================================================================\n`;
        logEntry += `🚨 [ERROR LOG] Timestamp: ${istTime} | Step: [${stepName}]\n`;
        logEntry += `💥 Message: ${errMessage}\n`;
        if (errStack) {
            logEntry += `📍 Stack Trace:\n${errStack}\n`;
        }
        if (metadata && Object.keys(metadata).length > 0) {
            logEntry += `🔍 Metadata Context: ${JSON.stringify(metadata, null, 2)}\n`;
        }
        logEntry += `==========================================================================\n`;

        try {
            fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
        } catch (e) {
            console.error(`❌ [REVERSAL LOGGER ERROR] Failed to write error log: ${e.message}`);
        }
    }
}

module.exports = new ReversalLogger();
