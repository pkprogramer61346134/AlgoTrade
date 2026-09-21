const fs = require('fs');
const path = require('path');
const SpotRiskDeltaCalculator = require('../../src/spotRiskDeltaCalculator');
const { systemLogger } = require('../../src/systemLogger');

const JOURNAL_DIR = path.resolve(__dirname, '../../server/data');
const JOURNAL_FILE = path.join(JOURNAL_DIR, 'trade_journal.json');
const CONFIG_FILE = path.join(__dirname, 'configPaper.json');

class PaperTradeManager {
    constructor(config = null) {
        this.config = config || this.loadDefaultConfig();
        this.activeOrder = null;
        this.paperBalance = this.loadPaperBalance();
    }

    loadDefaultConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            }
        } catch (e) {}
        return {
            executionMode: "PAPER",
            paperTrading: { initialCapital: 100000, riskRewardRatio: 2.0, maxTradesPerDay: 3 },
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

    loadPaperBalance() {
        const initialCap = this.config.paperTrading?.initialCapital || this.config.paperCapital || 100000;
        try {
            this.ensureJournalStorage();
            if (fs.existsSync(JOURNAL_FILE)) {
                const raw = fs.readFileSync(JOURNAL_FILE, 'utf-8');
                const journal = JSON.parse(raw);
                const paperTrades = Array.isArray(journal) ? journal.filter(t => t.mode === "PAPER") : [];
                if (paperTrades.length > 0) {
                    const lastTrade = paperTrades[0];
                    if (lastTrade && lastTrade.balanceAfter !== undefined && !isNaN(lastTrade.balanceAfter)) {
                        const bal = Number(lastTrade.balanceAfter);
                        return bal > 0 ? bal : initialCap;
                    }
                    const totalPaperPnL = paperTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
                    const calculated = Number((initialCap + totalPaperPnL).toFixed(2));
                    return calculated > 0 ? calculated : initialCap;
                }
            }
        } catch (e) {
            console.warn(`⚠️ Error reading paper balance from journal: ${e.message}`);
        }
        return initialCap;
    }

    resetPaperBalance(newCapital = 100000) {
        this.paperBalance = Number(newCapital);
        return this.paperBalance;
    }

    executePaperOrder(orderParams) {
        const {
            optionSymbol,
            optionType,
            spotPrice,
            spotSL,
            spotTarget,
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

        const paperOrderId = `PAPER_${Date.now()}`;
        console.log(`\n📄 [PAPER TRADE MANAGER] Paper Trade Executed!`);
        console.log(`   - Order ID: #${paperOrderId} | Symbol: ${optionSymbol}`);
        console.log(`   - Option Type: ${optionType} | Qty: ${qty} units (${numLots} Lots)`);
        console.log(`   - Spot Entry: ₹${spotPrice} | Spot SL: ₹${spotSL || 'N/A'} | Spot Target: ₹${spotTarget || 'N/A'}`);
        console.log(`   - Premium Entry: ₹${optionPremiumPrice} | Premium SL: ₹${optionSL} | Target (1:${rrRatio}): ₹${target}`);

        this.activeOrder = {
            orderId: paperOrderId,
            mode: "PAPER",
            status: "ACTIVE",
            date: dateStr,
            entryTime: timeStr,
            startTimestamp: Date.now(),
            type: signal.type || signal.signalType || "BUY_SIGNAL",
            optionType: optionType,
            spotEntryPrice: spotPrice,
            spotSL: spotSL || (optionType === "CE" ? spotPrice - 20 : spotPrice + 20),
            spotTarget: spotTarget || (optionType === "CE" ? spotPrice + 40 : spotPrice - 40),
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
            extendedRiderEnabled: signal ? signal.extendedRiderEnabled !== false : true,
            t1Hit: false,
            t1EventEmitted: false,
            highestPremium: optionPremiumPrice,
            lowestPremium: optionPremiumPrice,
            pnlRupees: 0.0,
            pnlPct: 0.0,
            allocatedCapital: Number((optionPremiumPrice * qty).toFixed(2))
        };

        return {
            status: "success",
            handshake: "CONFIRMED_PAPER",
            mode: "PAPER",
            order: this.activeOrder
        };
    }

    monitorPosition(currentSpotPrice = null, liveOptionPremium = null) {
        if (!this.activeOrder || this.activeOrder.status !== "ACTIVE") return null;

        const pos = this.activeOrder;
        if (!currentSpotPrice && pos) currentSpotPrice = pos.spotEntryPrice;

        let currentPremium = liveOptionPremium;
        if (currentPremium && currentPremium > 0) {
            currentPremium = Number(currentPremium.toFixed(2));
        } else {
            const spotMove = (currentSpotPrice || pos.spotEntryPrice) - pos.spotEntryPrice;
            const deltaMove = pos.optionType === "CE" ? (spotMove * 0.50) : (-spotMove * 0.50);
            currentPremium = Math.max(0.5, Number((pos.optionPremiumPrice + deltaMove).toFixed(2)));
        }

        pos.currentPremium = currentPremium;
        const ptsDiff = Number((currentPremium - pos.optionPremiumPrice).toFixed(2));
        pos.pnlRupees = Number((ptsDiff * pos.quantity).toFixed(2));
        pos.pnlPct = pos.optionPremiumPrice > 0 ? Number(((ptsDiff / pos.optionPremiumPrice) * 100).toFixed(2)) : 0.0;

        if (currentPremium > pos.highestPremium) pos.highestPremium = currentPremium;
        if (currentPremium < pos.lowestPremium) pos.lowestPremium = currentPremium;

        // DYNAMIC TRAILING SL TO BREAKEVEN: When profit reaches >= 50% of target distance, trail SL to Entry Price!
        const targetDist = pos.target - pos.optionPremiumPrice;
        if (targetDist > 0 && (pos.highestPremium - pos.optionPremiumPrice) >= (targetDist * 0.50)) {
            if (pos.currentSL < pos.optionPremiumPrice) {
                pos.currentSL = pos.optionPremiumPrice; // Trail to Cost!
                console.log(`🎯 [PAPER TRAILING SL] #${pos.orderId} SL Trailed to Breakeven Cost Price: ₹${pos.currentSL}`);
            }
        }

        const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

        let exitTriggered = false;
        let exitReason = "";
        let exitPrice = currentPremium;

        const nowKolkata = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const totalMins = nowKolkata.getHours() * 60 + nowKolkata.getMinutes();

        const dualExit = SpotRiskDeltaCalculator.evaluateDualLayerExit({
            currentSpotPrice,
            currentOptionPremium: currentPremium,
            activePosition: pos,
            totalMins
        });

        if (dualExit.exitTriggered) {
            return this.closePosition(dualExit.exitReason, dualExit.exitPrice, currentSpotPrice, timeStr);
        }

        if (pos.t2Hit && !pos.t2EventEmitted) {
            pos.t2EventEmitted = true;
            return {
                status: "ACTIVE",
                event: "T2_TRAILED",
                currentPremium: currentPremium,
                lockedSL: pos.currentSL,
                target3: pos.target3
            };
        }

        if (pos.t1Hit && !pos.t1EventEmitted) {
            pos.t1EventEmitted = true;
            return {
                status: "ACTIVE",
                event: "T1_TRAILED",
                currentPremium: currentPremium,
                lockedSL: pos.currentSL,
                target2: pos.target2
            };
        }

        return null;
    }

    closePosition(reason = "MANUAL_SQUAREOFF", exitPremiumPrice = 0, spotExitPrice = null, timeStr = "") {
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
            mode: "PAPER",
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

        this.paperBalance = Number((this.paperBalance + totalPnL).toFixed(2));
        closedTradeRecord.balanceAfter = this.paperBalance;

        this.saveTradeToJournal(closedTradeRecord);

        console.log(`\n🏁 [PAPER POSITION CLOSED] #${pos.orderId} | Reason: ${actualExitReason} | PnL: ${totalPnL >= 0 ? '+' : ''}₹${totalPnL}`);
        this.activeOrder = null;

        return {
            status: "POSITION_CLOSED",
            reason: actualExitReason,
            trade: closedTradeRecord
        };
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

    getTradeJournal(modeFilter = null) {
        try {
            this.ensureJournalStorage();
            if (fs.existsSync(JOURNAL_FILE)) {
                const raw = fs.readFileSync(JOURNAL_FILE, 'utf-8');
                const journal = JSON.parse(raw);
                if (Array.isArray(journal)) {
                    if (modeFilter) {
                        return journal.filter(t => t.mode === modeFilter);
                    }
                    return journal;
                }
            }
        } catch (e) {
            console.warn(`⚠️ Error reading trade journal: ${e.message}`);
        }
        return [];
    }
}

module.exports = PaperTradeManager;
