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
     * Format and log an error to master_sl_error.log
     * 
     * @param {string} envName - Environment ("PAPER_TRADE" | "REAL_TRADE" | "BACKTEST")
     * @param {string} stepName - Step Name (e.g. "CHECK_BALANCE", "SELECT_STRIKE", "PLACE_ORDER", "MODIFY_SL")
     * @param {Error|string} error - Error object or message string
     * @param {Object} [metadata] - Optional additional debug data
     */
    logError(envName, stepName, error, metadata = {}) {
        const timestamp = new Date().toISOString();
        const errMessage = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error && error.stack ? error.stack.split('\n')[1]?.trim() || '' : '';

        const logEntry = `[${timestamp}] [${envName}] [STEP: ${stepName}] ERROR: ${errMessage} ${errStack ? `| ${errStack}` : ''} ${Object.keys(metadata).length > 0 ? `| Data: ${JSON.stringify(metadata)}` : ''}\n`;

        console.error(`❌ [MASTER SL LOGGER] [${envName}] [${stepName}] ${errMessage}`);

        try {
            fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
        } catch (e) {
            console.error(`⚠️ [MASTER SL LOGGER] Failed to append to ${LOG_FILE}: ${e.message}`);
        }
    }

    /**
     * Log a retry attempt warning
     */
    logRetry(envName, stepName, attempt, maxRetries, errorMsg, delayMs) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${envName}] [STEP: ${stepName}] RETRY (${attempt}/${maxRetries}): ${errorMsg} | Retrying in ${delayMs}ms...\n`;

        console.warn(`⚠️ [MASTER SL RETRY] [${envName}] [${stepName}] Attempt ${attempt}/${maxRetries} failed: ${errorMsg}. Retrying in ${delayMs}ms...`);

        try {
            fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
        } catch (e) {}
    }

    /**
     * Log an audit event (e.g. Entry, Exit, SL Trailed)
     */
    logInfo(envName, action, message) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${envName}] [${action}] ${message}\n`;

        console.log(`ℹ️ [MASTER SL INFO] [${envName}] [${action}] ${message}`);

        try {
            fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
        } catch (e) {}
    }
}

module.exports = new MasterSLLogger();
