/**
 * Real Trading Configuration Manager
 * Location: C:\AlgoTrade\server\realtread\config.js
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'real_config.json');

const DEFAULT_CONFIG = {
    realTradeEnabled: false,    // Disabled by default for account safety
    maxBudgetPercent: 20,       // Max 20% of funds per trade
    defaultBudget: 20000.00,    // Default budget limit
    selectedStock: {
        securityId: "13",
        exchangeSegment: "IDX_I",
        symbol: "NIFTY",
        interval: "5",
        instrument: "INDEX"
    }
};

class RealConfigManager {
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
            console.warn(`⚠️ [REAL CONFIG] Warning loading config file: ${e.message}`);
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
            console.error(`❌ [REAL CONFIG] Failed to save config file: ${e.message}`);
            return false;
        }
    }

    setEnabled(status) {
        this.config.realTradeEnabled = Boolean(status);
        this.saveConfig();
        console.log(`📝 [REAL CONFIG] Real Trade Enabled status set to: ${this.config.realTradeEnabled}`);
        return this.config.realTradeEnabled;
    }

    getConfig() {
        return this.config;
    }
}

module.exports = new RealConfigManager();
