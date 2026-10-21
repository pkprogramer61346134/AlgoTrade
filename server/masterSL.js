/**
 * MasterSL - Signal -> Order Flow
 * Location: C:\AlgoTrade\server\masterSL.js
 *
 * Token Handling:
 *   - MasterSL token generate नहीं करता।
 *   - अगर किसी Dhan API call में token error आए, तो { status: "token_expired" }
 *     return करेगा — main.js इसे पकड़कर token refresh करवाएगा,
 *     और MasterSL.processSignal को दोबारा call करेगा।
 */

const configManager = require("./config_manager");
const PositionChecker = require("./position/dhan-position");
const dhanBalance = require("./classoforder/founds/dhan-real-balance");
const strikeSelector = require("./classoforder/strickprice/strike-price-selector");
const orderManager = require("./classoforder/order/order-manager");

/**
 * Detect token-related errors from Dhan API responses
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function isTokenError(error) {
    if (!error) return false;
    const msg = String(error.message || error).toLowerCase();
    return (
        msg.includes("invalid token") ||
        msg.includes("token is expired") ||
        msg.includes("token expired") ||
        msg.includes("unauthorized") ||
        msg.includes("dh-901") ||
        msg.includes("dh-906") ||
        msg.includes("authentication") ||
        msg.includes("401")
    );
}

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
        let side = signal?.consensus;

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

        const isHeads = Math.random() < 0.5;
        side = isHeads ? "BUY" : "SELL";

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


            // STEP 3: BEST STRIKE
            const strike = await strikeSelector.getBestStrike(
                {
                    securityId: scrip.securityId || 13,
                    exchangeSegment: scrip.exchangeSegment || "IDX_I"
                },
                balance,  // 👈 balance नहीं, budgetToSend यूज़ करें
                optionType,
                Number(signal.entry || 0)
            );

            const entry = Number(strike.liveLtp);
            const lots = strike.lots;
            const lotSize = Number(strike.lotSize);

            // STEP 4: TARGET / SL
            const targetPrice = Number((entry + cfg.targetPoints).toFixed(2));
            const stopLossPrice = Number((entry - cfg.stopLossPoints).toFixed(2));

            this.log(
                `STEP 4 Target/SL | Target=+${cfg.targetPoints} | SL=-${cfg.stopLossPoints}`
            );

            // STEP 5: PLACE SUPER ORDER
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

            // STEP 6: RECORD LAST TRADE
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
                status: "PLACED"
            };

            this.log(
                `STEP 6 Order placed: ${order.orderId} | ${strike.symbol} | Qty ${order.quantity} | ` +
                `Entry ₹${entry} | Target ₹${targetPrice} | SL ₹${stopLossPrice}`
            );

            this.maxtread = this.maxtread - 1;

            return { status: "success", order, strike };

        } catch (error) {
            // Token error → signal main.js to refresh token
            if (isTokenError(error)) {
                this.log(`TOKEN ERROR detected: ${error.message} → signaling main.js to refresh`);
                return { status: "token_expired", message: error.message };
            }

            // Non-token error → return as error
            this.log(`FLOW STOPPED: ${error.message}`);
            return { status: "error", message: error.message };

        } finally {
            this.isProcessing = false;
        }
    }
}

module.exports = new MasterSL();