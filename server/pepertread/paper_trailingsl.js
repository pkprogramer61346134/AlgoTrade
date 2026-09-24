/**
 * Paper Trailing Stop Loss & Paper Execution Engine
 * Location: C:\AlgoTrade\server\pepertread\paper_trailingsl.js
 * 
 * Features:
 * 1. 100% Pure Paper Trading (ZERO real broker order API calls).
 * 2. Selects best option strike via select-best-strike.js using dummy balance.
 * 3. Calculates Option SL & Targets (TR1 1:1, TR2 1:2, TR3 1:3, TR4 1:4) via option-sl-target.js.
 * 4. Deducts required margin from dummy balance in config.js.
 * 5. Places Paper Order with Initial Target set at TR4 (1:4 ratio) and Initial SL.
 * 6. Streams live option tick prices via dhan-option-live-price.js.
 * 7. Dynamically Trails SL with Breathing Room buffer:
 *    - TR1 (1:1) hit  -> Trail SL to Cost-to-Cost (Entry LTP - breathingRoom buffer)
 *    - TR1.5 (Midway) -> Trail SL to TR1 - buffer
 *    - TR2 (1:2) hit  -> Trail SL to TR1
 *    - TR2.5 (Midway) -> Trail SL to TR2 - buffer
 *    - TR3 (1:3) hit  -> Trail SL to TR2
 *    - TR4 (1:4) hit  -> Target Hit Exit! (Returns margin + profit to dummy balance)
 * 8. Saves active position, trailing logs, and trade history in trade_record.json.
 */

const fs = require('fs');
const path = require('path');

const paperConfig = require('./config');
const { selectBestOptionStrike } = require('../../utility/usedfull/select-best-strike');
const { calculateOptionSLAndTargets } = require('../../utility/usedfull/option-sl-target');
const { DhanOptionLivePrice } = require('../../utility/dhan-option-live-price');

const TRADE_RECORD_FILE = path.join(__dirname, 'trade_record.json');

class PaperTrailingSLEngine {
    constructor() {
        this.optionTracker = null;
        this.activePosition = null;
        this.tradeHistory = [];
        this.isProcessingTick = false;

        this.loadRecords();
    }

    /**
     * Load trade records from trade_record.json
     */
    loadRecords() {
        try {
            if (fs.existsSync(TRADE_RECORD_FILE)) {
                const data = JSON.parse(fs.readFileSync(TRADE_RECORD_FILE, 'utf-8'));
                this.activePosition = data.activePosition || null;
                this.tradeHistory = Array.isArray(data.history) ? data.history : [];
            }
        } catch (e) {
            console.warn(`⚠️ [PAPER TRAILING ENGINE] Notice loading trade_record.json: ${e.message}`);
            this.activePosition = null;
            this.tradeHistory = [];
        }
    }

    /**
     * Save trade records to trade_record.json
     */
    saveRecords() {
        try {
            const payload = {
                activePosition: this.activePosition,
                history: this.tradeHistory
            };
            fs.writeFileSync(TRADE_RECORD_FILE, JSON.stringify(payload, null, 2), 'utf-8');
        } catch (e) {
            console.error(`❌ [PAPER TRAILING ENGINE] Error saving trade_record.json: ${e.message}`);
        }
    }

    /**
     * Execute Paper Trailing Trade
     */
    async executePaperTrailingTrade(signal, selectedStock) {
        if (this.activePosition && this.activePosition.status === "OPEN") {
            console.warn(`⏸️ [PAPER SIGNAL IGNORED] A paper trade is already open (${this.activePosition.symbol}). Ignoring new signal.`);
            return this.activePosition;
        }

        const cfg = paperConfig.getConfig();
        const availableBalance = cfg.currentBalance;
        const maxBudget = (availableBalance * (cfg.maxBudgetPercent / 100));

        if (availableBalance < 1000) {
            console.warn(`⚠️ [PAPER ORDER REJECTED] Insufficient dummy balance: ₹${availableBalance}`);
            return null;
        }

        const optionType = signal.consensus === "BUY" ? "CE" : "PE";
        console.log("==========================================================================");
        console.log(`🚀 [PAPER TRAILING TRADE] Signal: ${signal.consensus} | Spot: ₹${signal.entry} | Stock: ${selectedStock.symbol}`);
        console.log(`💰 Available Dummy Balance: ₹${availableBalance.toFixed(2)} | Max Budget: ₹${maxBudget.toFixed(2)}`);
        console.log("==========================================================================\n");

        // 1. Select Best Option Strike using Dummy Balance
        const strikeRes = await selectBestOptionStrike({
            spotPrice: signal.entry,
            optionType: optionType,
            maxBudget: Math.max(1000, maxBudget),
            amountPercent: cfg.maxBudgetPercent
        });

        if (!strikeRes || !strikeRes.securityId) {
            console.warn(`⚠️ [PAPER ORDER NOTICE] Could not find suitable option contract.`);
            return null;
        }

        const qty = Number(strikeRes.totalQty || strikeRes.qty || 65);
        const totalCost = Number(strikeRes.requiredMargin || strikeRes.totalCost || (strikeRes.liveLtp * qty));

        if (availableBalance < totalCost) {
            console.warn(`⚠️ [PAPER ORDER REJECTED] Required margin (₹${totalCost.toFixed(2)}) exceeds dummy balance (₹${availableBalance.toFixed(2)})`);
            return null;
        }

        // Deduct margin from dummy balance in config.js
        paperConfig.deductMargin(totalCost);

        // 2. Calculate Option SL & Targets (TR1 - TR4) via option-sl-target.js
        const levels = await calculateOptionSLAndTargets({
            securityId: strikeRes.securityId,
            entryPrice: strikeRes.liveLtp,
            interval: "5",
            method: "HYBRID"
        });

        const entryLtp = levels.entryPrice;
        const initialSl = levels.stopLoss.sl;
        const tr1 = levels.targets.tr1.price;
        const tr2 = levels.targets.tr2.price;
        const tr3 = levels.targets.tr3.price;
        const tr4 = levels.targets.tr4.price;

        const tr1Midway = Number((tr1 + ((tr2 - tr1) / 2)).toFixed(2));
        const tr2Midway = Number((tr2 + ((tr3 - tr2) / 2)).toFixed(2));

        const now = new Date();
        const breathingRoom = 0.50; // Saas lene ke buffer points

        this.activePosition = {
            tradeId: "PAPER_TRAIL_" + Date.now(),
            securityId: String(strikeRes.securityId),
            symbol: strikeRes.symbol,
            optionType,
            entryLtp,
            currentLtp: entryLtp,
            qty: qty,
            totalMargin: Number(totalCost.toFixed(2)),
            initialSl,
            currentSl: initialSl,
            targetTr4: tr4,
            levels: {
                initialSl,
                tr1,
                tr1Midway,
                tr2,
                tr2Midway,
                tr3,
                tr4
            },
            breathingRoom: breathingRoom,
            trailingStage: "INITIAL",
            trailLogs: [
                { time: now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }), stage: "INITIAL", sl: initialSl, ltp: entryLtp, note: "Paper Order placed with Initial SL & TR4 Target" }
            ],
            strategyId: signal.strategyId,
            strategyName: signal.strategyName,
            status: "OPEN",
            pnl: 0.00,
            pnlPercent: "0.00%",
            entryTime: now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
            entryDate: now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
        };

        this.saveRecords();

        console.log("\n==========================================================================");
        console.log(`🎉 [PAPER TRAILING ORDER PLACED SUCCESSFULLY]`);
        console.log(`   Contract Symbol  : ${this.activePosition.symbol}`);
        console.log(`   Security ID      : ${this.activePosition.securityId}`);
        console.log(`   Entry Option LTP : ₹${this.activePosition.entryLtp}`);
        console.log(`   Initial SL       : ₹${this.activePosition.currentSl}`);
        console.log(`   Final TR4 Target : ₹${this.activePosition.targetTr4} (1:4 Ratio Target)`);
        console.log(`   Total Margin     : ₹${this.activePosition.totalMargin}`);
        console.log("==========================================================================\n");

        // 3. Start Live Option Tick Tracker
        this.startOptionLiveTracking();

        return this.activePosition;
    }

    /**
     * Start Dhan Option Live Price Tracker for Paper Position
     */
    startOptionLiveTracking() {
        if (!this.activePosition || this.activePosition.status !== "OPEN") return;

        if (this.optionTracker) {
            try { this.optionTracker.close(); } catch (e) {}
        }

        this.optionTracker = new DhanOptionLivePrice();
        console.log(`📡 [PAPER OPTION LIVE FEED] Streaming tick-by-tick for Option ${this.activePosition.symbol} (${this.activePosition.securityId})...`);

        this.optionTracker.streamOptionLtp({
            securityId: this.activePosition.securityId,
            exchangeSegment: "NSE_FNO",
            buyPrice: this.activePosition.entryLtp,
            qty: this.activePosition.qty
        }, (tick) => {
            this.handleOptionLiveTick(tick);
        });
    }

    /**
     * Live Tick Handler: Dynamic Trailing SL & Target Check for Paper Trade
     */
    async handleOptionLiveTick(tick) {
        if (!this.activePosition || this.activePosition.status !== "OPEN" || this.isProcessingTick) return;

        try {
            this.isProcessingTick = true;
            const liveLtp = Number(tick.ltp || tick.liveLtp);
            if (!liveLtp || isNaN(liveLtp)) return;

            const pos = this.activePosition;
            pos.currentLtp = liveLtp;

            // Update PnL
            const diff = liveLtp - pos.entryLtp;
            pos.pnl = Number((diff * pos.qty).toFixed(2));
            const pnlPct = Number(((diff / pos.entryLtp) * 100).toFixed(2));
            pos.pnlPercent = `${pnlPct >= 0 ? '+' : ''}${pnlPct}%`;

            const buffer = Number(pos.breathingRoom || 0.50);
            const riskAmt = Math.max(0.1, pos.entryLtp - pos.initialSl);
            const dynamicBuffer = Number(Math.min(buffer, riskAmt * 0.2).toFixed(2));

            const lvls = pos.levels;
            const nowTime = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

            let slUpdated = false;
            let newSl = pos.currentSl;
            let newStage = pos.trailingStage;
            let logNote = "";

            // 1. Reached TR1 (1:1 Ratio) -> Trail SL to Cost to Cost (Entry LTP)
            if (liveLtp >= lvls.tr1 && pos.trailingStage === "INITIAL") {
                const targetSl = Number(Math.max(pos.currentSl, pos.entryLtp - dynamicBuffer).toFixed(2));
                if (targetSl > pos.currentSl) {
                    newSl = targetSl;
                    newStage = "TRAILED_COST_TO_COST";
                    logNote = `🎯 TR1 (1:1) Reached (LTP ₹${liveLtp} >= TR1 ₹${lvls.tr1}). Trailed SL to Cost-to-Cost: ₹${newSl}`;
                    slUpdated = true;
                }
            }
            // 2. Reached TR1 Midway -> Trail SL to TR1 - dynamicBuffer
            else if (liveLtp >= lvls.tr1Midway && (pos.trailingStage === "TRAILED_COST_TO_COST")) {
                const targetSl = Number((lvls.tr1 - dynamicBuffer).toFixed(2));
                if (targetSl > pos.currentSl) {
                    newSl = targetSl;
                    newStage = "TRAILED_TR1_MIDWAY";
                    logNote = `📈 TR1 Midway Reached (LTP ₹${liveLtp} >= ₹${lvls.tr1Midway}). Trailed SL to TR1-buffer: ₹${newSl}`;
                    slUpdated = true;
                }
            }
            // 3. Reached TR2 (1:2 Ratio) -> Trail SL to TR1
            else if (liveLtp >= lvls.tr2 && (pos.trailingStage === "TRAILED_COST_TO_COST" || pos.trailingStage === "TRAILED_TR1_MIDWAY")) {
                if (lvls.tr1 > pos.currentSl) {
                    newSl = lvls.tr1;
                    newStage = "TRAILED_TR1";
                    logNote = `🎯 TR2 (1:2) Reached (LTP ₹${liveLtp} >= TR2 ₹${lvls.tr2}). Trailed SL to TR1: ₹${newSl}`;
                    slUpdated = true;
                }
            }
            // 4. Reached TR2 Midway -> Trail SL to TR2 - dynamicBuffer
            else if (liveLtp >= lvls.tr2Midway && (pos.trailingStage === "TRAILED_TR1")) {
                const targetSl = Number((lvls.tr2 - dynamicBuffer).toFixed(2));
                if (targetSl > pos.currentSl) {
                    newSl = targetSl;
                    newStage = "TRAILED_TR2_MIDWAY";
                    logNote = `📈 TR2 Midway Reached (LTP ₹${liveLtp} >= ₹${lvls.tr2Midway}). Trailed SL to TR2-buffer: ₹${newSl}`;
                    slUpdated = true;
                }
            }
            // 5. Reached TR3 (1:3 Ratio) -> Trail SL to TR2
            else if (liveLtp >= lvls.tr3 && (pos.trailingStage === "TRAILED_TR1" || pos.trailingStage === "TRAILED_TR2_MIDWAY")) {
                if (lvls.tr2 > pos.currentSl) {
                    newSl = lvls.tr2;
                    newStage = "TRAILED_TR2";
                    logNote = `🎯 TR3 (1:3) Reached (LTP ₹${liveLtp} >= TR3 ₹${lvls.tr3}). Trailed SL to TR2: ₹${newSl}`;
                    slUpdated = true;
                }
            }

            // Apply SL Update if triggered
            if (slUpdated && newSl > pos.currentSl) {
                console.log(`\n🔄 [PAPER TRAILING SL UPDATED] ${logNote}`);
                pos.currentSl = newSl;
                pos.trailingStage = newStage;
                pos.trailLogs.push({
                    time: nowTime,
                    stage: newStage,
                    sl: newSl,
                    ltp: liveLtp,
                    note: logNote
                });
                this.saveRecords();
            }

            // CHECK EXIT CONDITIONS (TARGET HIT OR TRAILED SL HIT)
            if (liveLtp >= lvls.tr4) {
                console.log(`🟢 [PAPER TR4 TARGET HIT] Live LTP ₹${liveLtp} >= Target TR4 ₹${lvls.tr4}`);
                await this.closePaperPosition("TR4_TARGET_HIT", liveLtp);
            }
            else if (liveLtp <= pos.currentSl) {
                const exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                console.log(`🔴 [PAPER STOP LOSS HIT] Live LTP ₹${liveLtp} <= Trailed SL ₹${pos.currentSl} (${exitReason})`);
                await this.closePaperPosition(exitReason, liveLtp);
            } else {
                this.saveRecords();
            }

        } catch (err) {
            console.error(`❌ [PAPER TRAILING TICK ERROR] ${err.message}`);
        } finally {
            this.isProcessingTick = false;
        }
    }

    /**
     * Close Active Paper Trailing Position & Realize PnL into Dummy Balance
     */
    async closePaperPosition(reason = "MANUAL_EXIT", exitLtp = null) {
        if (!this.activePosition) return null;

        const pos = this.activePosition;
        const finalExitLtp = exitLtp || pos.currentLtp;
        const diff = finalExitLtp - pos.entryLtp;
        const finalPnl = Number((diff * pos.qty).toFixed(2));

        if (this.optionTracker) {
            try { this.optionTracker.close(); } catch (e) {}
            this.optionTracker = null;
        }

        const now = new Date();
        pos.status = "CLOSED";
        pos.exitReason = reason;
        pos.exitLtp = finalExitLtp;
        pos.exitTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
        pos.exitDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        pos.pnl = finalPnl;

        pos.trailLogs.push({
            time: pos.exitTime,
            stage: "CLOSED",
            sl: pos.currentSl,
            ltp: finalExitLtp,
            note: `Position Closed due to ${reason}. Realized PnL: ₹${finalPnl}`
        });

        // Restore Margin + Realized PnL back to Dummy Balance in config.js
        paperConfig.updateBalanceAndPnl(finalPnl, pos.totalMargin);

        // Move to history
        this.tradeHistory.unshift(pos);
        this.activePosition = null;
        this.saveRecords();

        console.log("\n==========================================================================");
        console.log(`🏁 [PAPER POSITION CLOSED] Reason: ${reason}`);
        console.log(`   Exit Option LTP : ₹${finalExitLtp}`);
        console.log(`   Realized PnL    : ₹${finalPnl}`);
        console.log(`   New Dummy Bal   : ₹${paperConfig.getConfig().currentBalance}`);
        console.log("==========================================================================\n");

        return pos;
    }

    /**
     * Get Complete State Payload for UI Rendering
     */
    getStatus() {
        const cfg = paperConfig.getConfig();
        return {
            enabled: cfg.paperTradeEnabled,
            initialBalance: cfg.initialBalance,
            currentBalance: cfg.currentBalance,
            totalPnl: cfg.totalPnl,
            totalTrades: cfg.totalTrades,
            winningTrades: cfg.winningTrades,
            losingTrades: cfg.losingTrades,
            winrate: cfg.totalTrades > 0 ? ((cfg.winningTrades / cfg.totalTrades) * 100).toFixed(1) + "%" : "0%",
            selectedStock: cfg.selectedStock,
            activePosition: this.activePosition,
            history: this.tradeHistory
        };
    }
}

module.exports = new PaperTrailingSLEngine();
