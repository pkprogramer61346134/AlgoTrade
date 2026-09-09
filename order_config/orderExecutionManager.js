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
                    const primaryConfigPath = path.join(CONFIG_DIR, files[0]);
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
        const usagePct = this.config.capitalUsagePct || 50;
        const allocatedCapital = (totalCapital * usagePct) / 100;
        const NIFTY_LOT_SIZE = 50;
        const costPerLot = (optionPrice || 180) * NIFTY_LOT_SIZE;

        if (costPerLot > 0) {
            // Calculate exact number of 50-qty Option Lots affordable with allocated capital
            const numLots = Math.max(1, Math.floor(allocatedCapital / costPerLot));
            const totalQty = numLots * NIFTY_LOT_SIZE;
            return totalQty;
        }
        return NIFTY_LOT_SIZE;
    }

    getATMStrike(spotPrice = 24500) {
        return Math.round(spotPrice / 50) * 50; // Round to nearest 50 points Nifty strike
    }

    async resolveOptionContractFromDhan(spotPrice = 24500, optionType = "CE") {
        const atmStrike = this.getATMStrike(spotPrice);
        let resolvedContract = {
            securityId: `OPT_${atmStrike}_${optionType}`,
            tradingSymbol: `NIFTY_${atmStrike}_${optionType}`,
            strike: atmStrike,
            price: 180.00,
            source: "calculated_fallback"
        };

        try {
            if (this.dhan && this.dhan.marketData && typeof this.dhan.marketData.getOptionChainExpiries === 'function') {
                // 1. Fetch live expiry list from Dhan Option Chain API (Nifty underlying security ID = 13)
                const expiryRes = await this.dhan.marketData.getOptionChainExpiries(13, 'NSE_FNO');
                const expList = expiryRes?.data?.data || expiryRes?.data || [];
                
                if (Array.isArray(expList) && expList.length > 0) {
                    const nearestExpiry = expList[0];
                    // 2. Fetch live option chain for nearest expiry
                    const ocRes = await this.dhan.marketData.getOptionChain(13, 'NSE_FNO', nearestExpiry);
                    const ocData = ocRes?.data?.data || ocRes?.data || ocRes;
                    const ocMap = ocData?.oc || ocData;

                    if (ocMap && (ocMap[atmStrike] || ocMap[atmStrike.toFixed(6)])) {
                        const strikeInfo = ocMap[atmStrike] || ocMap[atmStrike.toFixed(6)];
                        const legInfo = optionType === "CE" ? strikeInfo.ce : strikeInfo.pe;
                        
                        if (legInfo) {
                            resolvedContract = {
                                securityId: String(legInfo.securityId || legInfo.sec_id || `OPT_${atmStrike}_${optionType}`),
                                tradingSymbol: legInfo.tradingSymbol || `NIFTY_${atmStrike}_${optionType}`,
                                strike: atmStrike,
                                price: Number(legInfo.last_price || legInfo.ltp || legInfo.close || 180.00),
                                expiry: nearestExpiry,
                                source: "dhan_option_chain_api"
                            };
                            console.log(`📌 Dynamic Dhan Option Chain Resolved Contract: ${resolvedContract.tradingSymbol} (SecurityId: ${resolvedContract.securityId}, Price: ₹${resolvedContract.price})`);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`⚠️ Option chain lookup fallback: ${e.message}`);
        }

        return resolvedContract;
    }

    async executeOrder(signal, currentPrice = 24500, totalCapital = null) {
        this.config = this.loadConfig();
        const liveCapital = totalCapital || await this.fetchLiveCapital();

        // 1. Resolve ATM Strike & Option Type (CE for BUY, PE for SELL) from Dhan Option Chain API
        const spotPrice = signal.entryPrice || currentPrice;
        const optionType = signal.type === "BUY" ? "CE" : "PE";
        
        // Fetch exact securityId and live option premium from Dhan Option Chain
        const contractDetails = await this.resolveOptionContractFromDhan(spotPrice, optionType);
        const atmStrike = contractDetails.strike;
        const optionSymbol = contractDetails.tradingSymbol;
        const optionSecurityId = contractDetails.securityId;
        const optionPremiumPrice = contractDetails.price || 180;

        // 2. Calculate dynamic quantity based on live capital & option premium price
        const qty = this.calculateQuantity(liveCapital, optionPremiumPrice);

        // 3. Option Premium SL & Target (1:1.5 Risk-Reward)
        const premiumRiskPoints = 20; // 20 pts Option SL
        const optionSL = Math.max(1, optionPremiumPrice - premiumRiskPoints);
        const optionTarget = optionPremiumPrice + (1.5 * premiumRiskPoints);

        console.log(`\n🚀 [ORDER MANAGER] Processing F&O Option Order: ${signal.type}`);
        console.log(`   - Spot Price: ₹${spotPrice} -> ATM Strike: ${atmStrike}`);
        console.log(`   - Selected Contract: ${optionSymbol} (SecurityId: ${optionSecurityId})`);
        console.log(`   - Data Source: ${contractDetails.source}`);
        console.log(`   - Capital Allocation: ${this.config.capitalUsagePct}% of ₹${liveCapital}`);
        console.log(`   - Calculated Quantity: ${qty} units | Premium Entry: ₹${optionPremiumPrice}`);
        console.log(`   - Option SL: ₹${optionSL} | Option Target: ₹${optionTarget}`);

        // Order Payload for Dhan F&O Option Contract
        const orderPayload = {
            transactionType: "BUY", // Always BUY Option (CE for Bullish, PE for Bearish)
            exchangeSegment: "NSE_FNO",
            productType: this.config.productType || "INTRADAY",
            orderType: "MARKET",
            tradingSymbol: optionSymbol,
            securityId: optionSecurityId,
            quantity: qty,
            price: optionPremiumPrice,
            stopLoss: optionSL,
            targetPrice: optionTarget
        };

        let response = { status: "simulated_success", orderId: `ORD_${Date.now()}` };
        try {
            let apiRes = null;
            if (this.dhan.orders && typeof this.dhan.orders.placeOrder === 'function') {
                apiRes = await this.dhan.orders.placeOrder(orderPayload);
            }

            if (apiRes) {
                if (apiRes.status === "success") {
                    response = apiRes;
                } else if (apiRes.status === "error") {
                    console.log(`\n❌ [DHAN API RESPONSE]: Order Rejected / Market Closed!`);
                    console.log(`   - Error Code: ${apiRes.errorData?.errorCode || apiRes.statusCode}`);
                    console.log(`   - Message: ${apiRes.message || apiRes.errorData?.errorMessage}`);
                    response = apiRes;
                }
            }
        } catch (e) {
            console.log(`ℹ️ Dhan Super Order Payload Prepared: ${JSON.stringify(orderPayload)}`);
        }

        this.activeOrder = {
            orderId: response.orderId || `ORD_${Date.now()}`,
            type: signal.type,
            entryPrice: signal.entryPrice || currentPrice,
            stopLoss: signal.stopLoss,
            initialTarget: signal.targetPrice,
            currentSL: signal.stopLoss,
            quantity: qty,
            targetReached: false,
            highestPrice: currentPrice,
            lowestPrice: currentPrice
        };

        return { status: "success", order: this.activeOrder, payload: orderPayload };
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
        } else if (pos.type === "SELL") {
            if (currentPrice < pos.lowestPrice) pos.lowestPrice = currentPrice;

            if (!pos.targetReached && currentPrice <= pos.initialTarget) {
                pos.targetReached = true;
                const lockedSL = Number((pos.initialTarget + offset).toFixed(2));
                if (lockedSL < pos.currentSL) {
                    pos.currentSL = lockedSL;
                    slUpdated = true;
                    updateReason = `TARGET REACHED (₹${currentPrice}) -> SL Locked to Target + ${offset}pt (₹${pos.currentSL})`;
                }
            }

            if (pos.targetReached || currentPrice < (pos.entryPrice - moveReq)) {
                const newTrailingSL = Number((currentPrice + jumpStep).toFixed(2));
                if (newTrailingSL < pos.currentSL) {
                    pos.currentSL = newTrailingSL;
                    slUpdated = true;
                    updateReason = `PRICE JUMP (₹${currentPrice}) -> SL Trailed Down by ${jumpStep}pts (New SL: ₹${pos.currentSL})`;
                }
            }
        }

        if (slUpdated) {
            console.log(`\n⚡ [TRAILING SL UPDATE] Order #${pos.orderId}`);
            console.log(`   - Reason: ${updateReason}`);

            try {
                if (this.dhan.orders && typeof this.dhan.orders.modifyOrder === 'function') {
                    this.dhan.orders.modifyOrder(pos.orderId, {
                        triggerPrice: pos.currentSL,
                        quantity: pos.quantity
                    });
                }
            } catch (e) {}

            return { updated: true, orderId: pos.orderId, newSL: pos.currentSL, reason: updateReason };
        }

        return null;
    }
}

module.exports = OrderExecutionManager;
