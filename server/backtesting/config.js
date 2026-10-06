/**
 * Backtesting Configuration Manager
 * Location: C:\AlgoTrade\server\backtesting\config.js
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'backtest_config.json');

const DEFAULT_CONFIG = {
    maxTradesPerDay: 3,         // Max 3 trades per day limit
    targetMode: "TRAILING",     // 4-Stage Trailing SL Mode
    selectedStock: {
        securityId: "13",
        exchangeSegment: "IDX_I",
        symbol: "NIFTY",
        interval: "15",
        instrument: "INDEX"
    }
};

class BacktestConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
                const parsed = JSON.parse(raw);
                return { ...DEFAULT_CONFIG, ...parsed };
            }
        } catch (e) {
            console.warn(`⚠️ [BACKTEST CONFIG] Warning loading config file: ${e.message}`);
        }
        this.saveConfig(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
    }

    saveConfig(newConfig = this.config) {
        try {
            this.config = { ...this.config, ...newConfig };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
            return true;
        } catch (e) {
            console.error(`❌ [BACKTEST CONFIG] Failed to save config file: ${e.message}`);
            return false;
        }
    }

    getConfig() {
        return this.config;
    }
}

module.exports = new BacktestConfigManager();
