const fs = require('fs');
const path = require('path');
const { DhanSDK } = require('../dhanAPI/index');
const PaperTradeManager = require('./papertrade/paperTradeManager');
const RealTradeManager = require('./realtrade/realTradeManager');
const BacktestExecutionEngine = require('./backtest/backtestExecutionEngine');

const CONFIG_DIR = __dirname;
const FALLBACK_CONFIG_PATH = path.join(__dirname, '..', 'order_config.json');

class OrderExecutionManager {
    constructor(dhanSdk = null) {
        this.dhan = dhanSdk || new DhanSDK();
        this.config = this.loadConfig();

        this.paperManager = new PaperTradeManager(this.config);
        this.realManager = new RealTradeManager(this.dhan, this.config);
        this.backtestEngine = new BacktestExecutionEngine(this.config);

        this.isExecutingOrder = false;
    }

    loadConfig() {
        const configFiles = ["default_order_config.json", "order_config.json"];
        for (const file of configFiles) {
            const p = path.join(CONFIG_DIR, file);
            if (fs.existsSync(p)) {
                try {
                    return JSON.parse(fs.readFileSync(p, 'utf-8'));
                } catch (e) {}
            }
        }
        if (fs.existsSync(FALLBACK_CONFIG_PATH)) {
            try {
                return JSON.parse(fs.readFileSync(FALLBACK_CONFIG_PATH, 'utf-8'));
            } catch (e) {}
        }
        return {
            executionMode: "PAPER",
            paperTrading: { initialCapital: 10000, riskRewardRatio: 3, maxTradesPerDay: 4 },
            capitalUsagePct: 100,
            productType: "INTRADAY",
            defaultQuantity: 65,
            riskManagement: { maxOpenPositions: 1, maxTradesPerDay: 4, maxLossPerTrade: 1000, maxLossPerDay: 5000 },
            orderSwitchOn: true
        };
    }

    saveConfig(newConfig = {}) {
        this.config = { ...this.config, ...newConfig };
        const mainPath = path.join(CONFIG_DIR, "default_order_config.json");
        try {
            fs.writeFileSync(mainPath, JSON.stringify(this.config, null, 2), 'utf-8');
        } catch (e) {
            console.warn(`⚠️ Warning: Could not save order config: ${e.message}`);
        }
        this.paperManager.config = this.config;
        this.realManager.config = this.config;
        this.backtestEngine.config = this.config;
        return this.config;
    }

    get activeOrder() {
        return this.paperManager.activeOrder || this.realManager.activeOrder;
    }

    set activeOrder(order) {
        const mode = this.config.executionMode || "PAPER";
        if (mode === "REAL") {
            this.realManager.activeOrder = order;
        } else {
            this.paperManager.activeOrder = order;
        }
    }

    get paperBalance() {
        return this.paperManager.paperBalance;
    }

    set paperBalance(bal) {
        this.paperManager.paperBalance = bal;
    }

    loadPaperBalance() {
        return this.paperManager.loadPaperBalance();
    }

    resetPaperBalance(newCapital = 10000) {
        return this.paperManager.resetPaperBalance(newCapital);
    }

    async fetchLiveCapital() {
        this.config = this.loadConfig();
        const mode = this.config.executionMode || "PAPER";
        if (mode === "PAPER") {
            return this.paperManager.loadPaperBalance();
        }
        try {
            if (this.dhan && this.dhan.user && typeof this.dhan.user.getFundLimits === 'function') {
                const res = await this.dhan.user.getFundLimits();
                const available = res?.data?.availabelBalance || res?.data?.availableBalance || res?.availabelBalance || 0;
                if (available > 0) return available;
            }
        } catch (e) {}
        return this.paperManager.loadPaperBalance();
    }

    getATMStrike(spotPrice, optionType = "CE") {
        if (optionType === "PE") {
            return Math.ceil(spotPrice / 50) * 50;
        }
        return Math.floor(spotPrice / 50) * 50;
    }

    calculateQuantity(capital, optionPremiumPrice) {
        const capPct = (this.config.capitalUsagePct || 100) / 100;
        const allocatedCap = capital * capPct;
        const LOT_SIZE = 65;
        const costPerLot = (optionPremiumPrice || 120) * LOT_SIZE;
        const numLots = Math.max(1, Math.floor(allocatedCap / costPerLot));
        const cappedLots = Math.min(27, numLots);
        return cappedLots * LOT_SIZE;
    }

    async resolveOptionContractFromDhan(spotPrice = 23400, optionType = "CE", allocatedCapital = 10000) {
        return this.realManager.resolveOptionContractFromDhan(spotPrice, optionType, allocatedCapital);
    }

    isPositionActive() {
        return (this.paperManager.activeOrder !== null && this.paperManager.activeOrder.status === "ACTIVE") ||
               (this.realManager.activeOrder !== null && this.realManager.activeOrder.status === "ACTIVE");
    }

    isDailyLimitReached() {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const journal = this.getJournalData();
        const todayTrades = journal.filter(t => t.date === todayStr);

        const maxTrades = this.config.paperTrading?.maxTradesPerDay || this.config.riskManagement?.maxTradesPerDay || this.config.maxTradesPerDay || 4;
        if (todayTrades.length >= maxTrades) {
            return { limitReached: true, reason: `Daily Trade Limit (${todayTrades.length}/${maxTrades}) reached for today (${todayStr})` };
        }

        const maxLoss = this.config.riskManagement?.maxLossPerDay || 5000;
        const todayPnL = todayTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
        if (todayPnL <= -maxLoss) {
            return { limitReached: true, reason: `Daily Max Loss Limit (₹${todayPnL} / -₹${maxLoss}) reached` };
        }

        return { limitReached: false };
    }

    getJournalData() {
        return this.paperManager.getTradeJournal();
    }

    getTradeJournal(modeFilter = null) {
        return this.paperManager.getTradeJournal(modeFilter);
    }

    saveTradeToJournal(tradeRecord) {
        return this.paperManager.saveTradeToJournal(tradeRecord);
    }

    async executeOrder(signal, currentSpotPrice = 23400, totalCapital = null) {
        this.config = this.loadConfig();
        const mode = this.config.executionMode || "PAPER";
        const liveCapital = totalCapital || await this.fetchLiveCapital();

        if (this.isPositionActive()) {
            console.log(`⚠️ Handshake Lock: Active order open. Order Manager rejected duplicate signal.`);
            return { status: "rejected", message: "Active position currently open or execution in progress." };
        }

        this.isExecutingOrder = true;

        try {
            const limitCheck = this.isDailyLimitReached();
            if (limitCheck.limitReached) {
                console.log(`⚠️ Risk Limit Exceeded: ${limitCheck.reason}. Order Manager rejected order.`);
                return { status: "rejected", message: limitCheck.reason };
            }

            const spotPrice = signal.spotPrice || signal.entryPrice || currentSpotPrice;
            const optionType = (signal.type === "BUY_SIGNAL" || signal.type === "BUY" || signal.signalType === "BUY_SIGNAL") ? "CE" : "PE";

            let contractDetails;
            if (signal.entryPremium || signal.optionPremium || signal.price) {
                const premVal = Number(signal.entryPremium || signal.optionPremium || signal.price);
                const atmStrike = signal.atmStrike || this.getATMStrike(spotPrice, optionType);
                contractDetails = {
                    strike: atmStrike,
                    tradingSymbol: signal.optionSymbol || `NIFTY-2026-09-15-${atmStrike}-${optionType}`,
                    securityId: signal.securityId || (optionType === "CE" ? "47291" : "47286"),
                    price: premVal
                };
            } else {
                contractDetails = await this.resolveOptionContractFromDhan(spotPrice, optionType, liveCapital);
            }

            const atmStrike = contractDetails.strike;
            const optionSymbol = contractDetails.tradingSymbol;
            const optionSecurityId = contractDetails.securityId;
            const optionPremiumPrice = contractDetails.price || 36.5;

            const qty = signal.quantity || this.calculateQuantity(liveCapital, optionPremiumPrice);
            const numLots = signal.numLots || Math.max(1, Math.floor(qty / 65));

            const maxTradeLossRupees = this.config.paperTrading?.maxLossPerTrade || this.config.riskManagement?.maxLossPerTrade || 1000;
            const maxRiskPtsCap = Number((maxTradeLossRupees / qty).toFixed(2));

            const spotSL = signal.stopLoss ? Number(signal.stopLoss) : (optionType === "CE" ? spotPrice - 20 : spotPrice + 20);
            const spotRiskPoints = Math.max(5, Math.abs(spotPrice - spotSL));
            const delta = 0.50;
            const calculatedOptionRisk = Math.round(spotRiskPoints * delta);
            const premiumRiskPoints = Math.max(3, Math.min(maxRiskPtsCap, calculatedOptionRisk));

            const optionSL = signal.optionSL ? Number(signal.optionSL) : Math.max(1, Number((optionPremiumPrice - premiumRiskPoints).toFixed(2)));

            const rrRatio = signal.riskRewardRatio || this.config.paperTrading?.riskRewardRatio || this.config.riskRewardRatio || 3.0;
            const target = Number((optionPremiumPrice + (rrRatio * premiumRiskPoints)).toFixed(2));

            const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
            const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

            const orderParams = {
                optionSymbol,
                optionType,
                spotPrice,
                atmStrike,
                optionSecurityId,
                qty,
                numLots,
                optionPremiumPrice,
                optionSL,
                target,
                rrRatio,
                signal,
                dateStr,
                timeStr
            };

            if (mode === "PAPER") {
                return this.paperManager.executePaperOrder(orderParams);
            } else {
                return await this.realManager.executeRealOrder(orderParams);
            }
        } finally {
            this.isExecutingOrder = false;
        }
    }

    monitorActivePosition(currentSpotPrice = 23400, liveOptionPremium = null) {
        const mode = this.config.executionMode || "PAPER";
        if (mode === "REAL" && this.realManager.activeOrder) {
            return this.realManager.monitorPosition(currentSpotPrice, liveOptionPremium);
        }
        return this.paperManager.monitorPosition(currentSpotPrice, liveOptionPremium);
    }

    closeActivePosition(reason = "MANUAL_SQUAREOFF", exitPremiumPrice = 0, spotExitPrice = 23400, timeStr = "") {
        const mode = this.config.executionMode || "PAPER";
        if (mode === "REAL" && this.realManager.activeOrder) {
            return this.realManager.closePosition(reason, exitPremiumPrice, spotExitPrice, timeStr);
        }
        return this.paperManager.closePosition(reason, exitPremiumPrice, spotExitPrice, timeStr);
    }

    async cancelOrder(orderId = null) {
        const mode = this.config.executionMode || "PAPER";
        if (mode === "REAL") {
            return await this.realManager.cancelOrder(orderId);
        }
        return this.paperManager.closePosition("MANUAL_CANCEL", this.paperManager.activeOrder?.optionPremiumPrice || 0);
    }

    runBacktest(candles, stratConfig, initialCapital = 100000, capitalUsagePct = 100) {
        return this.backtestEngine.runBacktest(candles, stratConfig, initialCapital, capitalUsagePct);
    }
}

module.exports = OrderExecutionManager;
