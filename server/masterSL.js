/**
 * MasterSL - Signal -> Order Flow
 * Location: C:\AlgoTrade\server\masterSL.js
 *
 * Flow (on every BUY/SELL signal from Head Consensus Engine):
 *   1. Position check (server/position/dhan-position.js)  -> true = ignore signal
 *   2. Fund           (classoforder/founds/dhan-real-balance.js) -> real balance used directly
 *   3. Strike + Delta (classoforder/strickprice/strike-price-selector.js)
 *   4. Delta-based Target/SL conversion (NIFTY points → Option premium points)
 *   5. Super Order    (classoforder/order/order-manager.js)
 *
 * Delta-based Target/SL:
 *   NIFTY target/sl points को option premium points में Delta से convert किया जाता है
 *   Option Target = NIFTY Target × Delta
 *   Option SL     = NIFTY SL × Delta
 */

const configManager = require("./config_manager");
const PositionChecker = require("./position/dhan-position");
const dhanBalance = require("./classoforder/founds/dhan-real-balance");
const strikeSelector = require("./classoforder/strickprice/strike-price-selector");
const orderManager = require("./classoforder/order/order-manager");

class MasterSL {
    constructor() {
        this.positionChecker = new PositionChecker();
        this.isProcessing = false;
        this.lastTrade = null;
        this.lastEvent = null;

        const cfg = configManager.getConfig();
        this.maxtread = Number(cfg.maxTradesPerRun ?? 3);
    }

    log(msg) {
        const t = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
        console.log(`[MASTER SL ${t}] ${msg}`);
        this.lastEvent = { time: t, message: msg };
    }

    getStatus() {
        return {
            isProcessing: this.isProcessing,
            lastEvent: this.lastEvent,
            config: configManager.getConfig(),
            activePosition: this.lastTrade,
            maxtread: this.maxtread
        };
    }

    async processSignal(signal, scrip = {}) {
        const side = signal?.consensus;

        if (side !== "BUY" && side !== "SELL") {
            return { status: "ignored", reason: "NO_SIGNAL" };
        }

        if (this.isProcessing) {
            this.log(`Signal ${side} ignored: previous signal still processing.`);
            return { status: "ignored", reason: "BUSY" };
        }

        if (this.maxtread <= 0) {
            this.log(`Signal ${side} ignored: maximum trades reached.`);
            return { status: "ignored", reason: "MAX_TRADES" };
        }

        this.isProcessing = true;
        const cfg = configManager.getConfig();
        const optionType = side === "BUY" ? "CE" : "PE";

        try {
            // STEP 1: POSITION CHECK
            const hasPosition = await this.positionChecker.checkPosition();
            this.log(`STEP 1 Position check: ${hasPosition}`);
            if (hasPosition) {
                this.log(`Open position exists -> ${side} signal ignored.`);
                return { status: "ignored", reason: "POSITION_EXISTS" };
            }

            // STEP 2: FUND
            const balance = await dhanBalance.getBalance();
            this.log(`STEP 2 Balance: ₹${balance}`);

            // STEP 3: BEST STRIKE + DELTA
            const strike = await strikeSelector.getBestStrike(
                {
                    securityId: scrip.securityId || 13,
                    exchangeSegment: scrip.exchangeSegment || "IDX_I"
                },
                balance,
                optionType,
                Number(signal.entry || 0)
            );

            const entry = Number(strike.liveLtp);
            const lots = strike.lots;
            const lotSize = Number(strike.lotSize);

            // Delta से NIFTY पॉइंट्स को Option premium पॉइंट्स में convert करो
            const optionDelta = Number(strike.delta);

            if (!Number.isFinite(optionDelta) || optionDelta <= 0 || optionDelta > 1) {
                throw new Error(
                    `[MASTER SL ERROR] Invalid Delta received from strike selector: ${strike.delta} (source=${strike.deltaSource || 'unknown'})`
                );
            }

            const targetPremiumPoints = Number((cfg.targetPoints * optionDelta).toFixed(2));
            const slPremiumPoints = Number((cfg.stopLossPoints * optionDelta).toFixed(2));

            const targetPrice = Number((entry + targetPremiumPoints).toFixed(2));
            const stopLossPrice = Number((entry - slPremiumPoints).toFixed(2));

            this.log(
                `STEP 3.5 Delta=${optionDelta} [${strike.deltaSource || 'LIVE'}] | ` +
                `NIFTY Target=${cfg.targetPoints}pts → Option Target=${targetPremiumPoints}pts | ` +
                `NIFTY SL=${cfg.stopLossPoints}pts → Option SL=${slPremiumPoints}pts`
            );

            // STEP 4: PLACE SUPER ORDER
            const order = await orderManager.placeSuperOrder({
                securityId: strike.securityId,
                exchangeSegment: cfg.orderExchangeSegment,
                transactionType: "BUY",
                lots,
                lotSize,
                price: entry,
                targetPrice,
                stopLossPrice,
                trailingJump: cfg.trailingJumpPoints
            });

            // STEP 5: RECORD LAST TRADE
            this.lastTrade = {
                symbol: strike.symbol,
                securityId: String(strike.securityId),
                optionType,
                orderId: order.orderId,
                qty: order.quantity,
                lots,
                entryPrice: entry,
                targetPrice,
                currentSl: stopLossPrice,
                trailingJump: cfg.trailingJumpPoints,
                delta: optionDelta,
                deltaSource: strike.deltaSource || 'LIVE',
                status: "PLACED"
            };

            this.log(
                `STEP 5 Order placed: ${order.orderId} | ${strike.symbol} | Qty ${order.quantity} | ` +
                `Entry ₹${entry} | Target ₹${targetPrice} | SL ₹${stopLossPrice} | ` +
                `Delta ${optionDelta} | Trailing ${cfg.trailingJumpPoints}`
            );

            this.maxtread = this.maxtread - 1;

            return { status: "success", order, strike };
        } catch (error) {
            this.log(`FLOW STOPPED: ${error.message}`);
            return { status: "error", message: error.message };
        } finally {
            this.isProcessing = false;
        }
    }
}

module.exports = new MasterSL();