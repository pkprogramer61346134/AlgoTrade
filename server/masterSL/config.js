/**
 * Master SL Central Configuration Manager
 * Location: C:\AlgoTrade\server\masterSL\config.js
 * 
 * Controls central risk parameters, capital allocation, breathing room, 
 * max loss per trade, trailing stage switches, and retry settings across all environments.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'master_config.json');

const DEFAULT_CONFIG = {
    maxBudgetPercent: 100,        // Capital percentage to use per trade (100% default)
    maxLossPerTrade: 300,         // Max ₹ Loss limit per trade (e.g. ₹300)
    breathingRoomPoints: 0.50,    // Breathing room buffer points (0.50)
    targetMode: "TRAILING",       // Target Mode: "1:1", "1:2", "1:3", "1:4", "TRAILING"
    maxTradesPerDay: 3,           // Max trades per day limit
    autoSquareOffTime: "15:10:00",// Auto square-off active positions at 03:10 PM
    autoTrailOnTR1: true,         // Trail to Cost-to-Cost when TR1 (1:1) hit
    autoTrailOnTR2: true,         // Trail to TR1 when TR2 (1:2) hit
    autoTrailOnTR3: true,         // Trail to TR2 when TR3 (1:3) hit
    maxRetriesPerStep: 5,         // Max 5 automatic retries per step on error
    retryDelayMs: 30000,          // Retry delay in ms (30 seconds)
    selectedStock: {
        securityId: "13",
        exchangeSegment: "IDX_I",
        symbol: "NIFTY",
        interval: "5",
        instrument: "INDEX"
    }
};

class MasterConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
                const cleanRaw = raw.replace(/\/\/.*/g, '');
                const parsed = JSON.parse(cleanRaw);
                return { ...DEFAULT_CONFIG, ...parsed };
            }
        } catch (e) {
            console.warn(`⚠️ [MASTER CONFIG] Warning loading master_config.json: ${e.message}`);
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
            console.error(`❌ [MASTER CONFIG] Failed to save master_config.json: ${e.message}`);
            return false;
        }
    }

    getConfig() {
        return this.config;
    }
}

module.exports = new MasterConfigManager();
