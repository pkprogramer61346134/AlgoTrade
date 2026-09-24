/**
 * Paper Trading Configuration & Balance Manager
 * Location: C:\AlgoTrade\server\pepertread\config.js
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'paper_config.json');

const DEFAULT_CONFIG = {
    paperTradeEnabled: true,
    initialBalance: 100000.00,  // ₹1,00,000.00 Starting Dummy Balance
    currentBalance: 100000.00,  // Active Available Balance
    totalPnl: 0.00,             // Realized Cumulative PnL
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    selectedStock: {
        securityId: "13",
        exchangeSegment: "IDX_I",
        symbol: "NIFTY",
        interval: "5",
        instrument: "INDEX"
    },
    maxBudgetPercent: 20        // Use max 20% of current balance per trade
};

class PaperConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
                const parsed = JSON.parse(raw);
                const loaded = { ...DEFAULT_CONFIG, ...parsed };
                if (isNaN(loaded.currentBalance) || loaded.currentBalance === null) {
                    loaded.currentBalance = loaded.initialBalance || 100000;
                }
                return loaded;
            }
        } catch (e) {
            console.warn(`⚠️ [PAPER CONFIG] Warning loading config file: ${e.message}`);
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
            console.error(`❌ [PAPER CONFIG] Failed to save config file: ${e.message}`);
            return false;
        }
    }

    setEnabled(status) {
        this.config.paperTradeEnabled = Boolean(status);
        this.saveConfig();
        console.log(`📝 [PAPER CONFIG] Paper Trade Enabled status set to: ${this.config.paperTradeEnabled}`);
        return this.config.paperTradeEnabled;
    }

    updateBalanceAndPnl(pnl, marginDeducted = 0) {
        const pnlVal = Number(pnl) || 0;
        this.config.currentBalance = Number((this.config.currentBalance + marginDeducted + pnlVal).toFixed(2));
        this.config.totalPnl = Number((this.config.totalPnl + pnlVal).toFixed(2));
        this.config.totalTrades += 1;
        if (pnlVal > 0) this.config.winningTrades += 1;
        else if (pnlVal < 0) this.config.losingTrades += 1;
        this.saveConfig();
        return this.config;
    }

    deductMargin(marginAmount) {
        const amount = Number(marginAmount) || 0;
        this.config.currentBalance = Number((this.config.currentBalance - amount).toFixed(2));
        this.saveConfig();
        return this.config.currentBalance;
    }

    getConfig() {
        return this.config;
    }
}

module.exports = new PaperConfigManager();
