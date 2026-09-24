/**
 * Trailing SL & Breathing Room Configuration Manager
 * Location: C:\AlgoTrade\server\trailingsl\config.js
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'trailing_config.json');

const DEFAULT_CONFIG = {
    trailingEnabled: true,
    breathingRoomPoints: 0.50,   // "Saas lene ke points" buffer (e.g. 0.50 points buffer to prevent noise SL trigger)
    maxBudgetPercent: 20,         // Use max 20% of account balance per trade
    defaultBudget: 20000.00,      // Fallback budget if account balance is unavailable
    targetRatio: "1:4",           // Initial Order Target set at 1:4 (TR4)
    autoTrailOnTR1: true,         // Trail to Cost-to-Cost when TR1 is hit
    autoTrailOnTR2: true,         // Trail to TR1 when TR2 is hit
    autoTrailOnTR3: true,         // Trail to TR2 when TR3 is hit
    selectedStock: {
        securityId: "13",
        exchangeSegment: "IDX_I",
        symbol: "NIFTY",
        interval: "5",
        instrument: "INDEX"
    }
};

class TrailingConfigManager {
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
            console.warn(`⚠️ [TRAILING CONFIG] Warning loading config file: ${e.message}`);
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
            console.error(`❌ [TRAILING CONFIG] Failed to save config file: ${e.message}`);
            return false;
        }
    }

    setBreathingRoom(points) {
        const val = Number(points);
        if (!isNaN(val) && val >= 0) {
            this.config.breathingRoomPoints = val;
            this.saveConfig();
            console.log(`📝 [TRAILING CONFIG] Breathing Room Points updated to: ${val}`);
        }
        return this.config.breathingRoomPoints;
    }

    setEnabled(status) {
        this.config.trailingEnabled = Boolean(status);
        this.saveConfig();
        console.log(`📝 [TRAILING CONFIG] Trailing SL Enabled set to: ${this.config.trailingEnabled}`);
        return this.config.trailingEnabled;
    }

    getConfig() {
        return this.config;
    }
}

module.exports = new TrailingConfigManager();
