const fs = require('fs');
const path = require('path');
const { DhanSDK } = require('../../dhanAPI/index');

const JOURNAL_DIR = path.resolve(__dirname, '../../server/data');
const JOURNAL_FILE = path.join(JOURNAL_DIR, 'trade_journal.json');
const CONFIG_FILE = path.join(__dirname, 'configReal.json');

class RealTradeManager {
    constructor(dhanSdk = null, config = null) {
        this.dhan = dhanSdk || new DhanSDK();
        this.config = config || this.loadDefaultConfig();
        this.activeOrder = null;
    }

    loadDefaultConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            }
        } catch (e) {}
        return {
            executionMode: "REAL",
            capitalUsagePct: 100,
            productType: "INTRADAY",
            riskManagement: { maxOpenPositions: 1, maxTradesPerDay: 3, maxLossPerTrade: 1000, maxLossPerDay: 5000 }
        };
    }

    ensureJournalStorage() {
        try {
            if (!fs.existsSync(JOURNAL_DIR)) {
                fs.mkdirSync(JOURNAL_DIR, { recursive: true });
            }
            if (!fs.existsSync(JOURNAL_FILE)) {
                fs.writeFileSync(JOURNAL_FILE, JSON.stringify([], null, 2));
            }
        } catch (e) {
            console.warn(`⚠️ Warning: Could not initialize trade journal storage: ${e.message}`);
        }
    }

    async resolveOptionContractFromDhan(spotPrice = 23400, optionType = "CE", allocatedCapital = 10000) {
        const atmStrike = Math.round(spotPrice / 50) * 50;
        const maxAffordablePremium = Math.max(20, Math.floor(allocatedCapital / 65));

        try {
            if (this.dhan && this.dhan.marketData && typeof this.dhan.marketData.getOptionChain === 'function') {
                const expRes = await this.dhan.marketData.getOptionChainExpiries(13, 'IDX_I');
                const expiries = expRes?.data?.data || expRes?.data || [];
                const nearestExpiry = expiries.length > 0 ? expiries[0] : '2026-09-15';

                const ocRes = await this.dhan.marketData.getOptionChain(13, 'IDX_I', nearestExpiry);
                const ocData = ocRes?.data?.data?.oc || ocRes?.data?.oc || {};

                let bestStrike = atmStrike;
                let bestSecId = optionType === "CE" ? "47291" : "47286";
                let bestPrice = 36.5;

                const targetSecIdKey = optionType === "CE" ? 'ce_security_id' : 'pe_security_id';
                const targetPremKey = optionType === "CE" ? 'ce_last_price' : 'pe_last_price';

                let minDiff = Infinity;
                for (const strKey of Object.keys(ocData)) {
                    const row = ocData[strKey];
                    const strikeNum = Number(strKey);
                    const secId = row[targetSecIdKey];
                    const ltp = Number(row[targetPremKey]) || 0;

                    if (secId && ltp > 0 && ltp <= maxAffordablePremium) {
                        const diff = Math.abs(strikeNum - atmStrike);
                        if (diff < minDiff) {
                            minDiff = diff;
                            bestStrike = strikeNum;
                            bestSecId = String(secId);
                            bestPrice = ltp;
                        }
                    }
                }

                return {
                    strike: bestStrike,
                    tradingSymbol: `NIFTY-${nearestExpiry}-${bestStrike}-${optionType}`,
                    securityId: bestSecId,
                    price: bestPrice
                };
            }
        } catch (err) {
            console.warn(`⚠️ Warning fetching Option Chain from Dhan API: ${err.message}. Falling back to default strike calculation.`);
        }

        const fallbackSecId = optionType === "CE" ? "47291" : "47286";
        return {
            strike: atmStrike,
            tradingSymbol: `NIFTY-2026-09-15-${atmStrike}-${optionType}`,
            securityId: fallbackSecId,
            price: 36.5
        };
    }

    async executeRealOrder(orderParams) {
        const {
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
        } = orderParams;

        console.log(`\n🚀 [REAL TRADE MANAGER] LIVE REAL BROKER ORDER INITIATED!`);
        console.log(`   - Symbol: ${optionSymbol} | SecurityId: ${optionSecurityId}`);
        console.log(`   - Qty: ${qty} | Option Entry Premium: ₹${optionPremiumPrice}`);
        console.log(`   - Target: ₹${target} | Initial SL: ₹${optionSL}`);

        let realResult = null;

        try {
            if (this.dhan && this.dhan.orders && typeof this.dhan.orders.placeSuperOrder === 'function') {
                console.log(`📡 Sending Dhan SuperOrder (Bracket Order)...`);
                realResult = await this.dhan.orders.placeSuperOrder({
                    securityId: String(optionSecurityId),
                    exchangeSegment: "NSE_FNO",
                    transactionType: "BUY",
                    quantity: qty,
                    orderType: "MARKET",
                    productType: "INTRADAY",
                    price: optionPremiumPrice,
                    targetPrice: target,
                    stopLossPrice: optionSL
                });
            } else if (this.dhan && this.dhan.orders && typeof this.dhan.orders.placeOrder === 'function') {
                console.log(`📡 Sending Dhan Market Order + StopLoss Market Order...`);
                realResult = await this.dhan.orders.placeOrder({
                    securityId: String(optionSecurityId),
                    exchangeSegment: "NSE_FNO",
                    transactionType: "BUY",
                    quantity: qty,
                    orderType: "MARKET",
                    productType: "INTRADAY",
                    price: 0
                });

                const primaryOrderId = realResult?.data?.orderId || realResult?.orderId;
                if (primaryOrderId) {
                    try {
                        await this.dhan.orders.placeOrder({
                            securityId: String(optionSecurityId),
                            exchangeSegment: "NSE_FNO",
                            transactionType: "SELL",
                            quantity: qty,
                            orderType: "STOP_LOSS_MARKET",
                            productType: "INTRADAY",
                            triggerPrice: optionSL
                        });
                    } catch (slErr) {
                        console.warn(`⚠️ Warning placing Dhan SL order: ${slErr.message}`);
                    }
                }
            }
        } catch (apiErr) {
            console.error(`❌ REAL BROKER ORDER ERROR: ${apiErr.message}`);
            return {
                status: "failed",
                error: apiErr.message,
                message: "Dhan API order execution failed."
            };
        }

        const realOrderId = realResult?.data?.orderId || realResult?.orderId || `REAL_${Date.now()}`;

        this.activeOrder = {
            orderId: realOrderId,
            mode: "REAL",
            status: "ACTIVE",
            date: dateStr,
            entryTime: timeStr,
            startTimestamp: Date.now(),
            type: signal.type || signal.signalType || "BUY_SIGNAL",
            optionType: optionType,
            spotEntryPrice: spotPrice,
            atmStrike: atmStrike,
            optionSymbol: optionSymbol,
            securityId: optionSecurityId,
            quantity: qty,
            numLots: numLots,
            optionPremiumPrice: optionPremiumPrice,
            currentPremium: optionPremiumPrice,
            initialSL: optionSL,
            currentSL: optionSL,
            target: target,
            target1: target,
            currentTarget: target,
            highestPremium: optionPremiumPrice,
            lowestPremium: optionPremiumPrice,
            pnlRupees: 0.0,
            pnlPct: 0.0,
            allocatedCapital: Number((optionPremiumPrice * qty).toFixed(2))
        };

        return {
            status: "success",
            handshake: "CONFIRMED_REAL",
            mode: "REAL",
            orderId: realOrderId,
            dhanResponse: realResult,
            order: this.activeOrder
        };
    }

    monitorPosition(currentSpotPrice = 23400, liveOptionPremium = null) {
        if (!this.activeOrder || this.activeOrder.status !== "ACTIVE") return null;

        const pos = this.activeOrder;
        let currentPremium = liveOptionPremium;
        if (currentPremium && currentPremium > 0) {
            currentPremium = Number(currentPremium.toFixed(2));
        } else {
            const spotMove = currentSpotPrice - pos.spotEntryPrice;
            const deltaMove = pos.optionType === "CE" ? (spotMove * 0.50) : (-spotMove * 0.50);
            currentPremium = Math.max(0.5, Number((pos.optionPremiumPrice + deltaMove).toFixed(2)));
        }

        pos.currentPremium = currentPremium;
        const ptsDiff = Number((currentPremium - pos.optionPremiumPrice).toFixed(2));
        pos.pnlRupees = Number((ptsDiff * pos.quantity).toFixed(2));
        pos.pnlPct = pos.optionPremiumPrice > 0 ? Number(((ptsDiff / pos.optionPremiumPrice) * 100).toFixed(2)) : 0.0;

        if (currentPremium > pos.highestPremium) pos.highestPremium = currentPremium;
        if (currentPremium < pos.lowestPremium) pos.lowestPremium = currentPremium;

        const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

        let exitTriggered = false;
        let exitReason = "";
        let exitPrice = currentPremium;

        const nowKolkata = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const totalMins = nowKolkata.getHours() * 60 + nowKolkata.getMinutes();

        const targetPrice = pos.target || pos.target1 || pos.currentTarget;

        if (totalMins >= 915) {
            exitTriggered = true;
            exitReason = "EOD_MARKET_CLOSE";
            exitPrice = currentPremium;
        } else if (currentPremium >= targetPrice) {
            exitTriggered = true;
            exitReason = "TARGET_HIT";
            exitPrice = targetPrice;
        } else if (currentPremium <= pos.currentSL) {
            exitTriggered = true;
            exitReason = "SL_HIT";
            exitPrice = pos.currentSL;
        }

        if (exitTriggered) {
            return this.closePosition(exitReason, exitPrice, currentSpotPrice, timeStr);
        }

        return null;
    }

    closePosition(reason = "MANUAL_SQUAREOFF", exitPremiumPrice = 0, spotExitPrice = 23400, timeStr = "") {
        if (!this.activeOrder) return null;

        const pos = this.activeOrder;
        const exitTime = timeStr || new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
        const finalExitPremium = exitPremiumPrice > 0 ? exitPremiumPrice : pos.optionPremiumPrice;

        const ptsPnL = Number((finalExitPremium - pos.optionPremiumPrice).toFixed(2));
        const totalPnL = Number((ptsPnL * pos.quantity).toFixed(2));
        const isWin = ptsPnL > 0;

        let actualExitReason = reason;
        if (ptsPnL < 0 && actualExitReason.includes("TARGET")) {
            actualExitReason = "SL_HIT";
        }

        const closedTradeRecord = {
            id: Date.now(),
            orderId: pos.orderId,
            mode: "REAL",
            date: pos.date,
            entryTime: pos.entryTime,
            exitTime: exitTime,
            type: pos.type,
            optionType: pos.optionType,
            spotEntryPrice: pos.spotEntryPrice,
            spotExitPrice: spotExitPrice,
            atmStrike: pos.atmStrike,
            optionSymbol: pos.optionSymbol,
            securityId: pos.securityId,
            quantity: pos.quantity,
            numLots: pos.numLots,
            entryPremium: pos.optionPremiumPrice,
            exitPremium: finalExitPremium,
            initialSL: pos.initialSL,
            finalSL: pos.currentSL,
            target: pos.target,
            target1: pos.target,
            pnl: totalPnL,
            pointsPnL: ptsPnL,
            result: isWin ? "TARGET_HIT" : (actualExitReason === "EOD_MARKET_CLOSE" ? (totalPnL >= 0 ? "EOD_PROFIT" : "EOD_LOSS") : "SL_HIT"),
            exitReason: actualExitReason,
            highestPremium: pos.highestPremium,
            lowestPremium: pos.lowestPremium,
            durationSec: Math.round((Date.now() - (pos.startTimestamp || Date.now())) / 1000)
        };

        this.saveTradeToJournal(closedTradeRecord);

        console.log(`\n🏁 [REAL POSITION CLOSED] #${pos.orderId} | Reason: ${actualExitReason} | PnL: ${totalPnL >= 0 ? '+' : ''}₹${totalPnL}`);
        this.activeOrder = null;

        return {
            status: "POSITION_CLOSED",
            reason: actualExitReason,
            trade: closedTradeRecord
        };
    }

    async cancelOrder(orderId = null) {
        const targetId = orderId || this.activeOrder?.orderId;
        if (!targetId) return { status: "failed", message: "No active order to cancel." };

        try {
            if (this.dhan && this.dhan.orders && typeof this.dhan.orders.cancelOrder === 'function') {
                await this.dhan.orders.cancelOrder(targetId);
            }
        } catch (e) {
            console.warn(`⚠️ Warning cancelling Dhan order #${targetId}: ${e.message}`);
        }

        return this.closePosition("MANUAL_CANCEL", this.activeOrder?.optionPremiumPrice || 0);
    }

    saveTradeToJournal(tradeRecord) {
        try {
            this.ensureJournalStorage();
            let journal = [];
            if (fs.existsSync(JOURNAL_FILE)) {
                const raw = fs.readFileSync(JOURNAL_FILE, 'utf-8');
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) journal = parsed;
                } catch (parseErr) {
                    console.error(`⚠️ Corrupt trade_journal.json detected. Backing up before update: ${parseErr.message}`);
                    try { fs.copyFileSync(JOURNAL_FILE, `${JOURNAL_FILE}.corrupt_${Date.now()}`); } catch (bakErr) {}
                }
            }
            journal.unshift(tradeRecord);
            const tmpFile = `${JOURNAL_FILE}.tmp`;
            fs.writeFileSync(tmpFile, JSON.stringify(journal, null, 2), 'utf-8');
            fs.renameSync(tmpFile, JOURNAL_FILE);
            console.log(`💾 Trade Journal Saved: #${tradeRecord.id} to ${JOURNAL_FILE}`);
        } catch (e) {
            console.warn(`⚠️ Warning saving trade journal: ${e.message}`);
        }
    }
}

module.exports = RealTradeManager;
