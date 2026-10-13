/**
 * Central Main Configuration Manager
 * Location: C:\AlgoTrade\server\config_manager.js
 *
 * Single source of truth: server/main_config.json
 */

const fs = require('fs');
const path = require('path');

const MAIN_CONFIG_FILE = path.join(__dirname, 'main_config.json');

const DEFAULT_CONFIG = {
    realTradeEnabled: true,
    selectedStock: {
        securityId: "13",
        exchangeSegment: "IDX_I",
        symbol: "NIFTY",
        instrument: "INDEX",
        interval: "15"
    },
    orderExchangeSegment: "NSE_FNO",
    targetPoints: 10,
    stopLossPoints: 3,
    trailingJumpPoints: 2,
    maxTradesPerRun: 3
};

class MainConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(MAIN_CONFIG_FILE)) {
                const data = fs.readFileSync(MAIN_CONFIG_FILE, 'utf-8');
                return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
            }
        } catch (e) {
            console.error(`❌ [MAIN CONFIG] Error reading main_config.json: ${e.message}`);
        }
        return { ...DEFAULT_CONFIG };
    }

    getConfig() {
        return this.config;
    }

    updateConfig(updates = {}) {
        this.config = { ...this.config, ...updates };
        try {
            fs.writeFileSync(MAIN_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
        } catch (e) {
            console.error(`❌ [MAIN CONFIG] Failed to save main_config.json: ${e.message}`);
        }
        return this.config;
    }
}

module.exports = new MainConfigManager();