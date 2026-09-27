/**
 * Central Main Configuration Manager
 * Location: C:\AlgoTrade\server\config_manager.js
 */

const fs = require('fs');
const path = require('path');
const realConfig = require('./realtread/config');

const MAIN_CONFIG_FILE = path.join(__dirname, 'main_config.json');

class MainConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(MAIN_CONFIG_FILE)) {
                const data = fs.readFileSync(MAIN_CONFIG_FILE, 'utf-8');
                return JSON.parse(data);
            }
        } catch (e) {
            console.error(`❌ [MAIN CONFIG] Error reading main_config.json: ${e.message}`);
        }
        return {
            realTradeEnabled: true,
            selectedStock: {
                securityId: "13",
                exchangeSegment: "IDX_I",
                symbol: "NIFTY",
                instrument: "INDEX",
                interval: "5"
            }
        };
    }

    getConfig() {
        return this.config;
    }

    updateConfig(updates = {}) {
        this.config = { ...this.config, ...updates };

        // Save to file
        try {
            fs.writeFileSync(MAIN_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
        } catch (e) {
            console.error(`❌ [MAIN CONFIG] Failed to save main_config.json: ${e.message}`);
        }

        // Sync with realConfig
        if (updates.realTradeEnabled !== undefined) {
            realConfig.setEnabled(updates.realTradeEnabled);
        }

        return this.config;
    }
}

module.exports = new MainConfigManager();
