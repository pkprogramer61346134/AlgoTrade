/**
 * Master Trailing Stop Loss & Smart Execution Engine
 * Location: C:\AlgoTrade\server\trailingsl\trailingsl.js
 * 
 * Workflow:
 * 1. Takes Signal or Spot price & optionType ("CE" / "PE").
 * 2. Uses select-best-strike.js to pick optimal option contract.
 * 3. Uses option-sl-target.js to calculate Option SL & Targets (TR1 1:1, TR2 1:2, TR3 1:3, TR4 1:4).
 * 4. Places Order via smart-order-executor.js with Initial Target set at TR4 (1:4 ratio) and Initial SL.
 * 5. Streams live option tick prices via dhan-option-live-price.js.
 * 6. Dynamically Trails SL:
 *    - TR1 (1:1) hit  -> Trail SL to Cost-to-Cost (Entry - breathingRoom buffer)
 *    - TR1.5 (Midway) -> Trail SL to TR1 (1:1)
 *    - TR2 (1:2) hit  -> Trail SL to TR1
 *    - TR2.5 (Midway) -> Trail SL to TR2 (1:2)
 *    - TR3 (1:3) hit  -> Trail SL to TR2
 *    - TR4 (1:4) hit  -> Target Hit Exit!
 * 7. Persists active position and full trailing audit history to trade_record.json.
 */

const fs = require('fs');
const path = require('path');

const trailingConfig = require('./config');
const { selectBestOptionStrike } = require('../../utility/usedfull/select-best-strike');
const { calculateOptionSLAndTargets } = require('../../utility/usedfull/option-sl-target');
const { SmartOrderExecutor } = require('../../utility/usedfull/smart-order-executor');
const { DhanOptionLivePrice } = require('../../utility/dhan-option-live-price');

const TRADE_RECORD_FILE = path.join(__dirname, 'trade_record.json');

class TrailingSLEngine {
    constructor() {
        this.executor = new SmartOrderExecutor();
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
            console.warn(`⚠️ [TRAILING ENGINE] Notice loading trade_record.json: ${e.message}`);
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
            console.error(`❌ [TRAILING ENGINE] Error saving trade_record.json: ${e.message}`);
        }
    }

    /**
     * Master Entry: Select Strike, Calculate Levels, Place Order with TR4 Target, & Start Live Trailing
     */
    async executeTrailingTrade(params = {}) {
        const spotPrice = Number(params.spotPrice || params.entrySpot || 24000);
        const optionType = String(params.optionType || "CE").toUpperCase();
        const maxBudget = Number(params.maxBudget || params.budget || trailingConfig.getConfig().defaultBudget);
        const isPaper = params.isPaper !== undefined ? Boolean(params.isPaper) : true;

        if (this.activePosition && this.activePosition.status === "OPEN") {
            console.warn(`⚠️ [TRAILING TRADE IGNORED] Active position ${this.activePosition.symbol} is already open. Close existing position first.`);
            return this.activePosition;
        }

        console.log("==========================================================================");
        console.log(`🚀 [TRAILING SL ENGINE] Executing Trade for ${optionType} | Spot: ₹${spotPrice} | Budget: ₹${maxBudget}`);
        console.log("==========================================================================\n");

        // 1. Select Best Option Strike
        const strikeRes = await selectBestOptionStrike({
            spotPrice: spotPrice,
            optionType: optionType,
            maxBudget: maxBudget,
            amountPercent: trailingConfig.getConfig().maxBudgetPercent
        });

        if (!strikeRes || !strikeRes.securityId) {
            throw new Error(`[TRAILING ENGINE ERROR] Could not select option strike for spot ₹${spotPrice}`);
        }

        console.log(`✅ [STRIKE SELECTED] ${strikeRes.symbol} (ID: ${strikeRes.securityId}) | Live LTP: ₹${strikeRes.liveLtp}`);

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

        console.log(`📊 [LEVELS CALCULATED] Entry: ₹${entryLtp} | Initial SL: ₹${initialSl}`);
        console.log(`🎯 TR1 (1:1): ₹${tr1} | TR2 (1:2): ₹${tr2} | TR3 (1:3): ₹${tr3} | TR4 (1:4 Target): ₹${tr4}`);

        // 3. Place Order via smart-order-executor.js with Initial Target set at TR4 (1:4 ratio)
        const qty = Number(strikeRes.totalQty || strikeRes.qty || 65);
        let orderRes = { status: "PAPER_PLACED", orderId: "TRAIL_PAPER_" + Date.now() };

        if (!isPaper) {
            orderRes = await this.executor.placeOptionOrder({
                securityId: strikeRes.securityId,
                transactionType: "BUY",
                price: entryLtp,
                targetPrice: tr4,
                stopLossPrice: initialSl,
                lotSize: qty,
                lots: 1
            });
        }

        const now = new Date();
        const cfg = trailingConfig.getConfig();

        this.activePosition = {
            tradeId: "TRAIL_" + Date.now(),
            securityId: String(strikeRes.securityId),
            symbol: strikeRes.symbol,
            optionType,
            entryLtp,
            currentLtp: entryLtp,
            qty: qty,
            totalMargin: strikeRes.requiredMargin || (entryLtp * qty),
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
            breathingRoom: cfg.breathingRoomPoints || 0.50,
            trailingStage: "INITIAL",
            trailLogs: [
                { time: now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }), stage: "INITIAL", sl: initialSl, ltp: entryLtp, note: "Order placed with Initial SL & TR4 Target" }
            ],
            status: "OPEN",
            pnl: 0.00,
            pnlPercent: "0.00%",
            entryTime: now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
            entryDate: now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
        };

        this.saveRecords();

        console.log("\n==========================================================================");
        console.log(`🎉 [TRAILING ORDER PLACED SUCCESSFULLY]`);
        console.log(`   Contract Symbol  : ${this.activePosition.symbol}`);
        console.log(`   Entry Option LTP : ₹${this.activePosition.entryLtp}`);
        console.log(`   Initial SL       : ₹${this.activePosition.currentSl}`);
        console.log(`   Final TR4 Target : ₹${this.activePosition.targetTr4} (1:4 Ratio Target)`);
        console.log(`   Breathing Room   : ${this.activePosition.breathingRoom} points`);
        console.log("==========================================================================\n");

        // 4. Start Live Option Tick Tracker
        this.startOptionLiveTracking();

        return this.activePosition;
    }

    /**
     * Start Dhan Option Live Price Tracker
     */
    startOptionLiveTracking() {
        if (!this.activePosition || this.activePosition.status !== "OPEN") return;

        if (this.optionTracker) {
            try { this.optionTracker.close(); } catch (e) {}
        }

        this.optionTracker = new DhanOptionLivePrice();
        console.log(`📡 [TRAILING LIVE FEED] Streaming tick-by-tick for Option ${this.activePosition.symbol} (${this.activePosition.securityId})...`);

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
     * Live Tick Handler: Evaluates Trailing SL Rules & Target Hit
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
            const lvls = pos.levels;
            const nowTime = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

            let slUpdated = false;
            let newSl = pos.currentSl;
            let newStage = pos.trailingStage;
            let logNote = "";

            // -------------------------------------------------------------
            // DYNAMIC TRAILING SL LOGIC WITH BREATHING ROOM BUFFER
            // -------------------------------------------------------------
            const riskAmt = Math.max(0.1, pos.entryLtp - pos.initialSl);
            const dynamicBuffer = Number(Math.min(buffer, riskAmt * 0.2).toFixed(2));

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
                console.log(`\n🔄 [TRAILING SL UPDATED] ${logNote}`);
                pos.currentSl = newSl;
                pos.trailingStage = newStage;
                pos.trailLogs.push({
                    time: nowTime,
                    stage: newStage,
                    sl: newSl,
                    ltp: liveLtp,
                    note: logNote
                });

                // Update SL on broker / live order
                try {
                    await this.executor.updateStopLoss({
                        securityId: pos.securityId,
                        newStopLossPrice: newSl
                    });
                } catch (e) {}

                this.saveRecords();
            }

            // -------------------------------------------------------------
            // CHECK EXIT CONDITIONS (TARGET HIT OR TRAILED SL HIT)
            // -------------------------------------------------------------

            // Exit 1: Final TR4 Target Hit (1:4 Ratio)
            if (liveLtp >= lvls.tr4) {
                console.log(`🟢 [FINAL TR4 TARGET HIT] Live LTP ₹${liveLtp} >= Target TR4 ₹${lvls.tr4}`);
                await this.closeTrailingPosition("TR4_TARGET_HIT", liveLtp);
            }
            // Exit 2: Trailed Stop Loss Hit
            else if (liveLtp <= pos.currentSl) {
                const exitReason = pos.trailingStage === "INITIAL" ? "INITIAL_SL_HIT" : `TRAILED_SL_HIT (${pos.trailingStage})`;
                console.log(`🔴 [STOP LOSS HIT] Live LTP ₹${liveLtp} <= Trailed SL ₹${pos.currentSl} (${exitReason})`);
                await this.closeTrailingPosition(exitReason, liveLtp);
            } else {
                this.saveRecords();
            }

        } catch (err) {
            console.error(`❌ [TRAILING TICK ERROR] ${err.message}`);
        } finally {
            this.isProcessingTick = false;
        }
    }

    /**
     * Close Active Trailing Position
     */
    async closeTrailingPosition(reason = "MANUAL_EXIT", exitLtp = null) {
        if (!this.activePosition) return null;

        const pos = this.activePosition;
        const finalExitLtp = exitLtp || pos.currentLtp;
        const diff = finalExitLtp - pos.entryLtp;
        const finalPnl = Number((diff * pos.qty).toFixed(2));

        if (this.optionTracker) {
            try { this.optionTracker.close(); } catch (e) {}
            this.optionTracker = null;
        }

        try {
            await this.executor.closePosition({ securityId: pos.securityId });
        } catch (e) {}

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

        // Move to history
        this.tradeHistory.unshift(pos);
        this.activePosition = null;
        this.saveRecords();

        console.log("\n==========================================================================");
        console.log(`🏁 [TRAILING POSITION CLOSED] Reason: ${reason}`);
        console.log(`   Exit Option LTP : ₹${finalExitLtp}`);
        console.log(`   Realized PnL    : ₹${finalPnl}`);
        console.log(`   Trailing Logs   : ${pos.trailLogs.length} updates recorded`);
        console.log("==========================================================================\n");

        return pos;
    }

    /**
     * Get Complete State Payload for UI Rendering
     */
    getStatus() {
        const cfg = trailingConfig.getConfig();
        return {
            enabled: cfg.trailingEnabled,
            breathingRoomPoints: cfg.breathingRoomPoints,
            selectedStock: cfg.selectedStock,
            activePosition: this.activePosition,
            history: this.tradeHistory
        };
    }
}

module.exports = new TrailingSLEngine();
