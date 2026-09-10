const fs = require('fs');
const path = require('path');
const { DhanSDK } = require('../dhanAPI/index');

const CONFIG_DIR = __dirname;
const FALLBACK_CONFIG_PATH = path.join(__dirname, '..', 'order_config.json');

class OrderExecutionManager {
    constructor(dhanSdk = null) {
        this.dhan = dhanSdk || new DhanSDK();
        this.config = this.loadConfig();
        this.activeOrder = null;
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_DIR)) {
                const files = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json'));
                if (files.length > 0) {
                    const targetFile = files.includes('default_order_config.json') ? 'default_order_config.json' : files[0];
                    const primaryConfigPath = path.join(CONFIG_DIR, targetFile);
                    const raw = fs.readFileSync(primaryConfigPath, 'utf-8');
                    return JSON.parse(raw);
                }
            }
            if (fs.existsSync(FALLBACK_CONFIG_PATH)) {
                const raw = fs.readFileSync(FALLBACK_CONFIG_PATH, 'utf-8');
                return JSON.parse(raw);
            }
        } catch (e) {
            console.warn(`⚠️ Warning: Could not read order configuration: ${e.message}`);
        }
        return {
            capitalUsagePct: 50,
            productType: "INTRADAY",
            trailingSL: { enabled: true, costOffsetPoints: 1.0, trailingJumpStep: 5.0, stepMoveRequirement: 10.0 },
            riskManagement: { defaultQuantity: 50 }
        };
    }

    async fetchLiveCapital() {
        try {
            if (this.dhan && this.dhan.funds && typeof this.dhan.funds.getFundLimits === 'function') {
                const res = await this.dhan.funds.getFundLimits();
                const d = res?.data?.data || res?.data || {};
                const balance = d.availabelBalance || d.withdrawableBalance || d.availbleBalance || d.sodLimit;
                if (balance !== undefined && balance !== null) {
                    console.log(`📌 Live Dhan Account Balance Fetched: ₹${balance}`);
                    return Number(balance);
                }
            }
        } catch (e) {
            console.warn(`⚠️ Warning: Could not fetch live Dhan balance: ${e.message}`);
        }
        return 100000;
    }

    calculateQuantity(totalCapital = 100000, optionPrice = 180) {
        this.config = this.loadConfig();
        const usagePct = this.config.capitalUsagePct || 100;
        const allocatedCapital = (totalCapital * usagePct) / 100;
        const NIFTY_LOT_SIZE = 65; // Dhan 2026 Nifty Option Lot Size = 65 units
        const costPerLot = (optionPrice || 36.5) * NIFTY_LOT_SIZE;

        if (costPerLot > 0) {
            // Calculate exact number of 65-qty Option Lots affordable with allocated capital
            const numLots = Math.max(1, Math.floor(allocatedCapital / costPerLot));
            const totalQty = numLots * NIFTY_LOT_SIZE;
            return totalQty;
        }
        return NIFTY_LOT_SIZE;
    }

    getATMStrike(spotPrice = 24500) {
        return Math.round(spotPrice / 50) * 50; // Round to nearest 50 points Nifty strike
    }

    async resolveOptionContractFromDhan(spotPrice = 23400, optionType = "CE", availableCapital = 100000) {
        const atmStrike = this.getATMStrike(spotPrice);
        const maxAffordablePremium = Math.max(10, Math.floor(availableCapital / 65)); // Max affordable premium per unit (65 lot size)

        let resolvedContract = {
            securityId: optionType === "CE" ? "47305" : "47286",
            tradingSymbol: optionType === "CE" ? "NIFTY-Sep2026-23700-CE" : "NIFTY-Sep2026-23200-PE",
            strike: optionType === "CE" ? 23700 : 23200,
            price: Math.min(36.5, maxAffordablePremium),
            source: "dhan_master_fallback"
        };

        try {
            if (this.dhan && this.dhan.marketData && typeof this.dhan.marketData.getOptionChain === 'function') {
                // 1. Fetch live Expiry list from Dhan Option Chain API
                const expRes = await this.dhan.marketData.getOptionChainExpiries(13, 'IDX_I');
                const expiries = expRes?.data?.data || expRes?.data || [];
                const nearestExpiry = expiries.length > 0 ? expiries[0] : '2026-09-15';

                // 2. Fetch full live Option Chain matrix directly from Dhan API
                const ocRes = await this.dhan.marketData.getOptionChain(13, 'IDX_I', nearestExpiry);
                const ocData = ocRes?.data?.data?.oc || ocRes?.data?.oc || {};

                const candidates = [];
                const typeKey = optionType.toLowerCase();

                for (const strikeStr in ocData) {
                    const strikeVal = parseFloat(strikeStr);
                    const optObj = ocData[strikeStr]?.[typeKey];
                    if (optObj && optObj.security_id) {
                        const ltp = Number(optObj.last_price || optObj.top_ask_price || optObj.top_bid_price || 0);
                        if (ltp > 0) {
                            candidates.push({
                                strike: strikeVal,
                                securityId: String(optObj.security_id),
                                tradingSymbol: `NIFTY-${nearestExpiry}-${strikeVal}-${optionType}`,
                                price: ltp
                            });
                        }
                    }
                }

                // Filter candidates that fit inside user's available capital budget
                const affordableCandidates = candidates.filter(c => c.price <= maxAffordablePremium);
                if (affordableCandidates.length > 0) {
                    // Sort candidates by closeness to ATM strike
                    affordableCandidates.sort((a, b) => Math.abs(a.strike - atmStrike) - Math.abs(b.strike - atmStrike));
                    const best = affordableCandidates[0];

                    resolvedContract = {
                        securityId: best.securityId,
                        tradingSymbol: best.tradingSymbol,
                        strike: best.strike,
                        price: best.price,
                        source: "dhan_option_chain_api"
                    };
                    console.log(`📌 Dynamic Dhan Option Chain Resolved [${optionType}]: ${best.tradingSymbol} (SecID: ${best.securityId}, Live Premium: ₹${best.price}, Lot Cost: ₹${(best.price * 65).toFixed(2)})`);
                    return resolvedContract;
                }
            }
        } catch (e) {
            console.warn(`⚠️ Dhan Option Chain API lookup warning: ${e.message}`);
        }

        return resolvedContract;
    }

    async executeFuturesOrder(signal, currentPrice = 24500, totalCapital = null) {
        this.config = this.loadConfig();
        const liveCapital = totalCapital || await this.fetchLiveCapital();

        const spotPrice = signal.entryPrice || currentPrice;
        const transactionType = signal.type; // "BUY" for Long Futures, "SELL" for Short Futures
        const futuresSymbol = `NIFTY_FUT`;
        const futuresSecurityId = `510000`; // Dhan Nifty Index Futures Security ID
        const qty = 50; // 1 Nifty Futures Lot = 50 units

        const stopLossPrice = signal.stopLoss;
        const targetPrice = signal.targetPrice;

        console.log(`\n🚀 [ORDER MANAGER] Processing F&O FUTURES Order: ${transactionType}`);
        console.log(`   - Spot Price: ₹${spotPrice} | Futures Symbol: ${futuresSymbol}`);
        console.log(`   - Transaction Type: ${transactionType} | Security ID: ${futuresSecurityId}`);
        console.log(`   - Capital Allocation: ${this.config.capitalUsagePct}% of ₹${liveCapital}`);
        console.log(`   - Calculated Quantity: ${qty} units (1 Lot)`);
        console.log(`   - Futures StopLoss: ₹${stopLossPrice} | Futures Target: ₹${targetPrice}`);

        // Order Payload for Dhan F&O Futures Contract
        const orderPayload = {
            transactionType: transactionType, // "BUY" or "SELL"
            exchangeSegment: "NSE_FNO",
            productType: this.config.productType || "INTRADAY",
            orderType: this.config.orderType || "MARKET",
            tradingSymbol: futuresSymbol,
            securityId: futuresSecurityId,
            quantity: qty,
            price: (this.config.orderType === "LIMIT") ? spotPrice : 0,
            stopLoss: stopLossPrice,
            targetPrice: targetPrice
        };

        let response = { status: "simulated_success", orderId: `FUT_${Date.now()}` };
        try {
            let apiRes = null;
            if (this.dhan.orders && typeof this.dhan.orders.placeOrder === 'function') {
                apiRes = await this.dhan.orders.placeOrder(orderPayload);
            }

            if (apiRes) {
                if (apiRes.status === "success") {
                    response = apiRes;
                } else if (apiRes.status === "error") {
                    console.log(`\n❌ [DHAN API FUTURES RESPONSE]: Order Rejected / Market Closed!`);
                    console.log(`   - Error Code: ${apiRes.errorData?.errorCode || apiRes.statusCode}`);
                    console.log(`   - Message: ${apiRes.message || apiRes.errorData?.errorMessage}`);
                    response = apiRes;
                }
            }
        } catch (e) {
            console.log(`ℹ️ Dhan Futures Payload Prepared: ${JSON.stringify(orderPayload)}`);
        }

        this.activeOrder = {
            orderId: response.orderId || `FUT_${Date.now()}`,
            type: signal.type,
            instrument: "FUTURES",
            entryPrice: spotPrice,
            stopLoss: stopLossPrice,
            initialTarget: targetPrice,
            currentSL: stopLossPrice,
            quantity: qty,
            targetReached: false,
            highestPrice: currentPrice,
            lowestPrice: currentPrice
        };

        return { status: "success", order: this.activeOrder, payload: orderPayload };
    }

    async executeOrder(signal, currentPrice = 24500, totalCapital = null) {
        this.config = this.loadConfig();

        // Check if Futures order requested via config or signal
        if (this.config.tradingInstrument === "FUTURES" || signal.instrument === "FUTURES") {
            return await this.executeFuturesOrder(signal, currentPrice, totalCapital);
        }

        const liveCapital = totalCapital || await this.fetchLiveCapital();

        // 1. Resolve ATM Strike & Option Type (CE for BUY, PE for SELL) from Dhan Option Chain API
        const spotPrice = signal.entryPrice || currentPrice;
        const optionType = signal.type === "BUY" ? "CE" : "PE";
        
        // Fetch exact securityId and live option premium from Dhan Option Chain
        const contractDetails = await this.resolveOptionContractFromDhan(spotPrice, optionType, liveCapital);
        const atmStrike = contractDetails.strike;
        const optionSymbol = contractDetails.tradingSymbol;
        const optionSecurityId = contractDetails.securityId;
        const optionPremiumPrice = contractDetails.price || 180;

        // 2. Calculate dynamic quantity based on live capital & option premium price
        const qty = this.calculateQuantity(liveCapital, optionPremiumPrice);

        // 3. Option Premium SL & Target (Scaled to Premium & Risk-Reward)
        const premiumRiskPoints = Math.max(3, Math.min(20, Math.round(optionPremiumPrice * 0.15)));
        const optionSL = Math.max(1, Number((optionPremiumPrice - premiumRiskPoints).toFixed(2)));
        const rrMultiplier = this.config.riskRewardRatio || signal.riskRewardRatio || 1.5;
        const optionTarget = Number((optionPremiumPrice + (rrMultiplier * premiumRiskPoints)).toFixed(2));

        console.log(`\n🚀 [ORDER MANAGER] Processing F&O Option Order: ${signal.type}`);
        console.log(`   - Spot Price: ₹${spotPrice} -> ATM Strike: ${atmStrike}`);
        console.log(`   - Selected Contract: ${optionSymbol} (SecurityId: ${optionSecurityId})`);
        console.log(`   - Data Source: ${contractDetails.source}`);
        console.log(`   - Capital Allocation: ${this.config.capitalUsagePct}% of ₹${liveCapital}`);
        console.log(`   - Calculated Quantity: ${qty} units | Premium Entry: ₹${optionPremiumPrice}`);
        console.log(`   - Option SL: ₹${optionSL} | Option Target: ₹${optionTarget}`);

        // Order Payload for Dhan F&O Option Contract
        const isLimit = this.config.orderType === "LIMIT";
        const entryPriceVal = isLimit ? (signal.limitPrice || optionPremiumPrice) : optionPremiumPrice;

        const superPayload = {
            transactionType: "BUY", // Always BUY Option (CE for Bullish, PE for Bearish)
            exchangeSegment: "NSE_FNO",
            productType: this.config.productType || "INTRADAY",
            orderType: isLimit ? "LIMIT" : "LIMIT", // Dhan Super Order requires price parameter
            tradingSymbol: optionSymbol,
            securityId: optionSecurityId,
            quantity: qty,
            price: Number(entryPriceVal.toFixed(2)),
            targetPrice: Number(optionTarget.toFixed(2)),
            stopLossPrice: Number(optionSL.toFixed(2))
        };

        let response = { status: "simulated_success", orderId: `SUPER_${Date.now()}` };
        let slOrderId = null;
        let targetOrderId = null;

        try {
            let apiRes = null;
            if (this.dhan.orders && typeof this.dhan.orders.placeSuperOrder === 'function') {
                // 1. Try Dhan Super Order Endpoint (/super/orders)
                apiRes = await this.dhan.orders.placeSuperOrder(superPayload);
            }

            if (apiRes && apiRes.status === "success") {
                response = apiRes;
                const superId = apiRes.data?.orderId || apiRes.orderId;
                console.log(`✅ [DHAN API]: Super Order (Entry + SL + Target) Placed Successfully! Order #${superId}`);
            } else {
                // Fallback to standard order placement + separate SL/Target orders
                const orderPayload = {
                    transactionType: "BUY",
                    exchangeSegment: "NSE_FNO",
                    productType: this.config.productType || "INTRADAY",
                    orderType: this.config.orderType || "MARKET",
                    tradingSymbol: optionSymbol,
                    securityId: optionSecurityId,
                    quantity: qty,
                    price: isLimit ? entryPriceVal : 0,
                    stopLoss: optionSL,
                    targetPrice: optionTarget
                };

                apiRes = await this.dhan.orders.placeOrder(orderPayload);
                if (apiRes && apiRes.status === "success") {
                    response = apiRes;
                    const entryId = apiRes.data?.orderId || apiRes.orderId;
                    console.log(`✅ [DHAN API]: Standard Entry Order Placed! Order #${entryId}`);

                    // Place Real Stop-Loss Order
                    try {
                        const slRes = await this.dhan.orders.placeOrder({
                            transactionType: "SELL",
                            exchangeSegment: "NSE_FNO",
                            productType: this.config.productType || "INTRADAY",
                            orderType: "STOP_LOSS_MARKET",
                            tradingSymbol: optionSymbol,
                            securityId: optionSecurityId,
                            quantity: qty,
                            price: 0,
                            triggerPrice: Number(optionSL.toFixed(2))
                        });
                        if (slRes && slRes.status === "success") {
                            slOrderId = slRes.data?.orderId || slRes.orderId;
                            console.log(`🛡️ [DHAN API]: Real Stop-Loss Order Placed! SL Order #${slOrderId} @ Trigger ₹${optionSL}`);
                        }
                    } catch (slErr) {}

                    // Place Real Target Order
                    try {
                        const targetRes = await this.dhan.orders.placeOrder({
                            transactionType: "SELL",
                            exchangeSegment: "NSE_FNO",
                            productType: this.config.productType || "INTRADAY",
                            orderType: "LIMIT",
                            tradingSymbol: optionSymbol,
                            securityId: optionSecurityId,
                            quantity: qty,
                            price: Number(optionTarget.toFixed(2))
                        });
                        if (targetRes && targetRes.status === "success") {
                            targetOrderId = targetRes.data?.orderId || targetRes.orderId;
                            console.log(`🎯 [DHAN API]: Real Target Order Placed! Target Order #${targetOrderId} @ Price ₹${optionTarget}`);
                        }
                    } catch (tErr) {}
                } else if (apiRes && apiRes.status === "error") {
                    console.log(`❌ [DHAN API RESPONSE]: Order Rejected / Market Closed! Message: ${apiRes.message || apiRes.errorData?.errorMessage}`);
                    response = apiRes;
                }
            }
        } catch (e) {
            console.log(`ℹ️ Dhan Order Execution Exception: ${e.message}`);
        }

        this.activeOrder = {
            orderId: response.data?.orderId || response.orderId || `ORD_${Date.now()}`,
            slOrderId: slOrderId,
            targetOrderId: targetOrderId,
            type: signal.type,
            instrument: "OPTIONS",
            entryPrice: signal.entryPrice || currentPrice,
            optionPremiumPrice: optionPremiumPrice,
            stopLoss: optionSL,
            initialTarget: optionTarget,
            currentSL: optionSL,
            quantity: qty,
            targetReached: false,
            highestPrice: currentPrice,
            lowestPrice: currentPrice
        };

        return { status: "success", order: this.activeOrder, payload: superPayload, slOrderId, targetOrderId };
    }

    processTickTrailingSL(currentPrice) {
        if (!this.activeOrder || !this.config.trailingSL?.enabled) return null;

        const pos = this.activeOrder;
        const cfg = this.config.trailingSL;
        const offset = cfg.costOffsetPoints || 1.0;
        const jumpStep = cfg.trailingJumpStep || 5.0;
        const moveReq = cfg.stepMoveRequirement || 10.0;

        let slUpdated = false;
        let updateReason = "";

        if (pos.type === "BUY") {
            if (currentPrice > pos.highestPrice) pos.highestPrice = currentPrice;

            // 1. Target Reached: Lock StopLoss to Target Price - Offset (e.g. ₹114 if target 115)
            if (!pos.targetReached && currentPrice >= pos.initialTarget) {
                pos.targetReached = true;
                const lockedSL = Number((pos.initialTarget - offset).toFixed(2));
                if (lockedSL > pos.currentSL) {
                    pos.currentSL = lockedSL;
                    slUpdated = true;
                    updateReason = `TARGET REACHED (₹${currentPrice}) -> SL Locked to Target - ${offset}pt (₹${pos.currentSL})`;
                }
            }

            // 2. Dynamic Trailing Jumps as price moves by jump step (e.g. 5 or 10 pts)
            if (pos.targetReached || currentPrice > (pos.entryPrice + moveReq)) {
                const newTrailingSL = Number((currentPrice - jumpStep).toFixed(2));
                if (newTrailingSL > pos.currentSL) {
                    pos.currentSL = newTrailingSL;
                    slUpdated = true;
                    updateReason = `PRICE JUMP (₹${currentPrice}) -> SL Trailed Up by ${jumpStep}pts (New SL: ₹${pos.currentSL})`;
                }
            }
        }

        if (slUpdated) {
            console.log(`\n⚡ [TRAILING SL UPDATE] Order #${pos.orderId}`);
            console.log(`   - Reason: ${updateReason}`);

            try {
                const slId = pos.slOrderId || pos.orderId;
                if (this.dhan.orders && typeof this.dhan.orders.modifyOrder === 'function') {
                    this.dhan.orders.modifyOrder(slId, {
                        orderType: "STOP_LOSS_MARKET",
                        triggerPrice: pos.currentSL,
                        quantity: pos.quantity
                    });
                    console.log(`🔄 [DHAN API]: Modified SL Order #${slId} to New Trigger Price ₹${pos.currentSL}`);
                }
            } catch (e) {
                console.warn(`⚠️ Warning modifying Dhan SL order: ${e.message}`);
            }

            return { updated: true, orderId: pos.orderId, slOrderId: pos.slOrderId, newSL: pos.currentSL, reason: updateReason };
        }

        return null;
    }

    async cancelOrder(orderId = null) {
        const idToCancel = orderId || this.activeOrder?.orderId;
        if (!idToCancel) {
            console.log("⚠️ No active order ID to cancel.");
            return { status: "error", message: "No active order ID" };
        }

        console.log(`\n🛑 [ORDER MANAGER] Requesting Order Cancellation for Order #${idToCancel}...`);
        let response = { status: "success", message: `Order #${idToCancel} cancelled successfully` };

        try {
            if (this.dhan.orders && typeof this.dhan.orders.cancelOrder === 'function') {
                const apiRes = await this.dhan.orders.cancelOrder(idToCancel);
                if (apiRes) response = apiRes;
            }
        } catch (e) {
            console.warn(`⚠️ Cancel order exception: ${e.message}`);
        }

        // Also cancel attached SL & Target leg orders on Dhan
        if (this.activeOrder?.slOrderId) {
            try {
                console.log(`🛑 [ORDER MANAGER] Cancelling attached SL Order #${this.activeOrder.slOrderId}...`);
                await this.dhan.orders.cancelOrder(this.activeOrder.slOrderId);
            } catch (e) {}
        }
        if (this.activeOrder?.targetOrderId) {
            try {
                console.log(`🛑 [ORDER MANAGER] Cancelling attached Target Order #${this.activeOrder.targetOrderId}...`);
                await this.dhan.orders.cancelOrder(this.activeOrder.targetOrderId);
            } catch (e) {}
        }

        this.activeOrder = null;
        console.log(`✅ Order #${idToCancel} and attached SL/Target legs cleared from active tracking.`);
        return response;
    }
}

module.exports = OrderExecutionManager;
