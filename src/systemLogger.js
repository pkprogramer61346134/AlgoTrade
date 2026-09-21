/**
 * CENTRALIZED INSTITUTIONAL SYSTEM ERROR LOGGER SERVICE
 * Location: src/systemLogger.js
 * 
 * Captures, formats, and persists system-wide errors with precise IST timestamps,
 * module components, stack trace details, and contextual metadata.
 * 
 * Non-disruptive design: Never throws exceptions to caller; safely logs and returns.
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../server/data');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'system_errors.log');
const ERROR_JSON_FILE = path.join(LOG_DIR, 'system_errors.json');
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB Max Log Size Cap

class SystemLogger {
    constructor() {
        this.ensureStorage();
    }

    ensureStorage() {
        try {
            if (!fs.existsSync(LOG_DIR)) {
                fs.mkdirSync(LOG_DIR, { recursive: true });
            }
            if (!fs.existsSync(ERROR_LOG_FILE)) {
                fs.writeFileSync(ERROR_LOG_FILE, `=== ALGOTRADE CENTRALIZED SYSTEM ERROR LOG INITIALIZED ===\n`, 'utf-8');
            }
            if (!fs.existsSync(ERROR_JSON_FILE)) {
                fs.writeFileSync(ERROR_JSON_FILE, JSON.stringify([], null, 2), 'utf-8');
            }
        } catch (e) {
            console.warn(`⚠️ Warning: SystemLogger storage initialization failed: ${e.message}`);
        }
    }

    getFormattedTimestamp() {
        const now = new Date();
        const istStr = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        return `${istStr}.${ms} IST`;
    }

    checkLogRotation() {
        try {
            if (fs.existsSync(ERROR_LOG_FILE)) {
                const stats = fs.statSync(ERROR_LOG_FILE);
                if (stats.size > MAX_LOG_SIZE_BYTES) {
                    const bakFile = path.join(LOG_DIR, `system_errors_${Date.now()}.bak.log`);
                    fs.renameSync(ERROR_LOG_FILE, bakFile);
                    fs.writeFileSync(ERROR_LOG_FILE, `=== LOG ROTATED AT ${this.getFormattedTimestamp()} ===\n`, 'utf-8');
                }
            }
        } catch (e) {}
    }

    /**
     * Centralized Error Logging Method
     * @param {string} moduleName Component/Module identifier (e.g. "REAL_TRADE", "PAPER_TRADE", "CANDLE_HUB", "DHAN_API", "CONSENSUS_ENGINE")
     * @param {string|Error} error Error object or string message
     * @param {object} metadata Additional contextual parameters (orderId, symbol, spotPrice, etc.)
     * @param {string} level Log level: "ERROR", "WARN", "CRITICAL"
     */
    logError(moduleName = "SYSTEM", error = null, metadata = {}, level = "ERROR") {
        try {
            this.ensureStorage();
            this.checkLogRotation();

            const timestamp = this.getFormattedTimestamp();
            const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });

            let errorMessage = "Unknown Error";
            let stackTrace = "";

            if (error instanceof Error) {
                errorMessage = error.message;
                stackTrace = error.stack || "";
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error && typeof error === 'object') {
                errorMessage = error.message || error.error || JSON.stringify(error);
            }

            const formattedModule = String(moduleName).toUpperCase();
            const formattedLevel = String(level).toUpperCase();
            const metaStr = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : "";

            // 1. Text Log Format: [TIMESTAMP] [LEVEL] [MODULE] Error Message | Meta
            const logLine = `[${timestamp}] [${formattedLevel}] [${formattedModule}] ${errorMessage}${metaStr ? ' | Meta: ' + metaStr : ''}${stackTrace ? '\nStack: ' + stackTrace : ''}\n`;

            // Append to text log file
            fs.appendFileSync(ERROR_LOG_FILE, logLine, 'utf-8');

            // 2. Structured JSON Log Format
            const jsonRecord = {
                id: `ERR_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                timestamp,
                date: dateStr,
                time: timeStr,
                level: formattedLevel,
                module: formattedModule,
                message: errorMessage,
                metadata,
                stack: stackTrace ? stackTrace.split('\n').map(s => s.trim()) : []
            };

            let jsonList = [];
            if (fs.existsSync(ERROR_JSON_FILE)) {
                try {
                    const raw = fs.readFileSync(ERROR_JSON_FILE, 'utf-8');
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) jsonList = parsed;
                } catch (pe) {}
            }

            jsonList.unshift(jsonRecord);
            if (jsonList.length > 500) jsonList = jsonList.slice(0, 500); // Keep last 500 errors

            const tmpJson = `${ERROR_JSON_FILE}.tmp`;
            fs.writeFileSync(tmpJson, JSON.stringify(jsonList, null, 2), 'utf-8');
            fs.renameSync(tmpJson, ERROR_JSON_FILE);

            console.error(`🚨 [SYSTEM ERROR LOGGED] [${formattedModule}] ${errorMessage}`);
            return jsonRecord;
        } catch (loggerErr) {
            console.warn(`⚠️ SystemLogger failed to write error: ${loggerErr.message}`);
        }
    }

    logWarn(moduleName, message, metadata = {}) {
        return this.logError(moduleName, message, metadata, "WARN");
    }

    logCritical(moduleName, error, metadata = {}) {
        return this.logError(moduleName, error, metadata, "CRITICAL");
    }

    getErrorLogs(limit = 100, moduleFilter = null) {
        try {
            if (fs.existsSync(ERROR_JSON_FILE)) {
                const raw = fs.readFileSync(ERROR_JSON_FILE, 'utf-8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    let filtered = parsed;
                    if (moduleFilter) {
                        filtered = filtered.filter(item => item.module === String(moduleFilter).toUpperCase());
                    }
                    return filtered.slice(0, limit);
                }
            }
        } catch (e) {}
        return [];
    }
}

const systemLogger = new SystemLogger();

module.exports = {
    SystemLogger,
    systemLogger
};
