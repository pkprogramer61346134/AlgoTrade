/**
 * Best Option Strike Selector Utility
 * Location: C:\AlgoTrade\utility\usedfull\select-best-strike.js
 * 
 * Uses real live Dhan API modules (DhanMarketData & DhanFunds):
 * - Auto-resolves Current Expiry & Live Spot Price.
 * - Auto-checks Account Balance (via DhanFunds) or uses provided maxBudget.
 * - Calculates Lot Quantity (lots * lotSize, e.g. 1 lot Nifty = 65 Qty).
 * - Selects exact ATM or closest budget-friendly near-ATM OTM strike based on strikeSteps.
 * 
 * NOTE: Delta को हटा दिया गया है — MasterSL अब Delta use नहीं करता।
 */

const { DhanMarketData } = require("../dhan-market-data");
const { DhanFunds } = require("../dhan-funds");

let moduleOcCache = {};
let moduleOcCacheTime = 0;

class StrikeSelector {
    constructor(options = {}) {
        this.marketData = new DhanMarketData(options);
        this.funds = new DhanFunds(options);
    }

    async getOptionChainWithRetry(securityId, exchangeSegment, currentExpiry) {
        let res = await this.marketData.getOptionChain(securityId, exchangeSegment, currentExpiry);
        if (res.status !== "success") {
            await new Promise(r => setTimeout(r, 500));
            res = await this.marketData.getOptionChain(securityId, exchangeSegment, currentExpiry);
        }
        return res;
    }

    async selectBestStrike(params = {}) {
        const securityId = Number(params.securityId || 13);
        const exchangeSegment = params.exchangeSegment || "IDX_I";
        const optionType = String(params.optionType || "").toUpperCase();
        const lots = Number(params.lots || 1);
        const lotSize = Number(params.lotSize || 65);
        const totalQty = lots * lotSize;

        if (optionType !== "CE" && optionType !== "PE") {
            throw new Error("[STRIKE SELECTOR ERROR] optionType must be 'CE' or 'PE'");
        }

        if (totalQty <= 0) {
            throw new Error("[STRIKE SELECTOR ERROR] Quantity must be greater than 0");
        }

        if (params.isBacktest) {
            const spotPrice = Number(params.spotPrice || 24000);
            const strikePrice = Math.round(spotPrice / 50) * 50;
            const ltp = 152.55;
            const reqMargin = ltp * totalQty;

            return {
                status: "success",
                underlyingSecurityId: securityId,
                underlyingExchangeSegment: exchangeSegment,
                spotPrice,
                expiry: "HISTORICAL_EXPIRY",
                optionType,
                lots,
                lotSize,
                totalQty,
                selectedStrike: strikePrice,
                isAtm: true,
                securityId: `NIFTY_${strikePrice}_${optionType}`,
                symbol: `NIFTY_${strikePrice}_${optionType}`,
                liveLtp: ltp,
                requiredMargin: Number(reqMargin.toFixed(2)),
                availableBudget: params.maxBudget || 100000,
                usedPercent: null,
                liveAccountBalance: null,
                bid: ltp,
                ask: ltp
            };
        }

        // 1. Resolve Available Budget
        let availableBudget = null;
        let usedPercent = null;
        let liveAccountBalance = null;

        let pctRaw = params.amountPercent !== undefined ? params.amountPercent : params["amount%"];
        if (pctRaw !== undefined && pctRaw !== null) {
            const parsedPct = parseFloat(String(pctRaw).replace("%", "").trim());
            if (!isNaN(parsedPct) && parsedPct > 0) {
                usedPercent = parsedPct;
            }
        }

        if (usedPercent !== null) {
            const fundRes = await this.funds.getFundLimits();
            if (fundRes.status !== "success" || !fundRes.data) {
                throw new Error(`[STRIKE SELECTOR ERROR] Failed to fetch Dhan account funds: ${fundRes.message || "Unknown error"}`);
            }
            liveAccountBalance = Number(fundRes.data.availabelBalance || fundRes.data.withdrawableBalance || 0);
            availableBudget = (liveAccountBalance * usedPercent) / 100;
        } else if (params.maxBudget !== undefined && params.maxBudget !== null) {
            availableBudget = Number(params.maxBudget);
        } else {
            usedPercent = 100;
            const fundRes = await this.funds.getFundLimits();
            if (fundRes.status !== "success" || !fundRes.data) {
                throw new Error(`[STRIKE SELECTOR ERROR] Failed to fetch Dhan account funds: ${fundRes.message || "Unknown error"}`);
            }
            liveAccountBalance = Number(fundRes.data.availabelBalance || fundRes.data.withdrawableBalance || 0);
            availableBudget = liveAccountBalance;
        }

        // 2. Fetch Option Chain Matrix (cached 3s)
        const now = Date.now();
        const cacheKey = `${securityId}_${exchangeSegment}`;
        let ocData = null;

        if (moduleOcCache[cacheKey] && (now - moduleOcCacheTime < 3000)) {
            ocData = moduleOcCache[cacheKey];
        } else {
            const currentExpiry = await this.marketData.getCurrentExpiry(securityId, exchangeSegment);
            if (!currentExpiry) {
                throw new Error("[STRIKE SELECTOR ERROR] Failed to fetch current expiry date from Dhan API");
            }

            const ocRes = await this.getOptionChainWithRetry(securityId, exchangeSegment, currentExpiry);
            const ocDataObj = ocRes.data?.data || ocRes.data || {};
            if (ocRes.status !== "success" || (!ocRes.data?.data && !ocRes.data)) {
                throw new Error(`[STRIKE SELECTOR ERROR] Failed to fetch Option Chain: ${ocRes.message || "Unknown error"}`);
            }

            ocData = {
                currentExpiry,
                spotPrice: Number(ocDataObj.last_price || ocDataObj.lastPrice || 0),
                ocMap: ocDataObj.oc || ocDataObj.optionChain || {}
            };
            moduleOcCache[cacheKey] = ocData;
            moduleOcCacheTime = Date.now();
        }

        const currentExpiry = ocData.currentExpiry;
        const spotPrice = ocData.spotPrice;
        if (spotPrice <= 0) {
            throw new Error("[STRIKE SELECTOR ERROR] Invalid underlying spot price received from Dhan API");
        }

        const ocMap = ocData.ocMap;
        const allStrikes = Object.keys(ocMap)
            .map(k => ({ key: k, strike: parseFloat(k) }))
            .filter(item => !isNaN(item.strike))
            .sort((a, b) => a.strike - b.strike);

        if (allStrikes.length === 0) {
            throw new Error("[STRIKE SELECTOR ERROR] Option Chain matrix is empty");
        }

        const getOptionSide = (strikeKey) => {
            const node = ocMap[strikeKey];
            if (!node) return null;
            return optionType === "CE" ? node.ce : node.pe;
        };

        const safeBudget = (availableBudget !== null && availableBudget > 0) ? Number((availableBudget * 0.85).toFixed(2)) : null;

        let selectedItem = null;
        let selectedSide = null;
        let selectedLtp = 0;
        let selectedReqMargin = 0;

        // --- NEW LOGIC: Jump N-steps OTM from ATM, then walk back if budget fails ---

        const strikeSteps = Math.max(0, Number(params.strikeSteps || 0));

        // 1. सभी strikes को sort करें (CE: ascending, PE: descending) ताकि OTM की तरफ जाने का order सही रहे
        const orderedStrikes = allStrikes
            .map(item => {
                const side = getOptionSide(item.key);
                if (!side || !side.security_id) return null;
                const ltp = Number(side.last_price || side.top_bid_price || 0);
                if (ltp <= 0) return null;
                return {
                    item,
                    side,
                    ltp,
                    reqMargin: ltp * totalQty,
                    strike: item.strike
                };
            })
            .filter(c => c !== null)
            .sort((a, b) => {
                // CE के लिए ऊपर जाना OTM है, PE के लिए नीचे जाना OTM है
                return optionType === "CE" ? a.strike - b.strike : b.strike - a.strike;
            });

        if (orderedStrikes.length === 0) {
            throw new Error("[STRIKE SELECTOR ERROR] No valid strikes with live LTP found.");
        }

        // 2. ATM (spot के सबसे करीब) ढूँढें
        let atmIndex = 0;
        let minDiff = Infinity;
        for (let i = 0; i < orderedStrikes.length; i++) {
            const diff = Math.abs(orderedStrikes[i].strike - spotPrice);
            if (diff < minDiff) {
                minDiff = diff;
                atmIndex = i;
            }
        }

        // 3. ATM से N-step OTM जाएँ (जैसे 3 लिखा तो 3 स्टेप आगे)
        const targetIndex = Math.min(atmIndex + strikeSteps, orderedStrikes.length - 1);

        let bestCandidate = null;

        // 4. Target से शुरू करें और budget में फिट होने तक ATM की तरफ पीछे आएँ
        for (let i = targetIndex; i >= 0; i--) {
            const candidate = orderedStrikes[i];

            // अगर safeBudget नहीं है या reqMargin safeBudget से कम है, तो यही select करें
            if (safeBudget === null || candidate.reqMargin <= safeBudget) {
                bestCandidate = candidate;
                break;
            }
        }

        // 5. Absolute Fallback: अगर ATM से लेकर target तक कुछ भी budget में नहीं आया, 
        // तो सबसे सस्ता option उठा लें (ताकि error न आए)
        if (!bestCandidate) {
            const affordable = orderedStrikes.filter(c => safeBudget === null || c.reqMargin <= safeBudget);
            if (affordable.length > 0) {
                // सबसे सस्ता (cheapest premium) ढूँढें
                affordable.sort((a, b) => a.reqMargin - b.reqMargin);
                bestCandidate = affordable[0];
            }
        }

        // 6. Final selection assign करें
        if (bestCandidate) {
            selectedItem = bestCandidate.item;
            selectedSide = bestCandidate.side;
            selectedLtp = bestCandidate.ltp;
            selectedReqMargin = bestCandidate.reqMargin;
        }

        if (!selectedItem || !selectedSide || !selectedSide.security_id) {
            const availMsg = availableBudget ? `Available Balance: ₹${availableBudget.toFixed(2)} (Safe Trade Limit with STT/Fees Buffer: ₹${safeBudget || 0})` : 'No balance available';
            throw new Error(`[STRIKE SELECTOR ERROR] Insufficient balance for ${lots} lot(s) (${totalQty} Qty) of ${optionType}! ${availMsg}. Please add funds to your Dhan account.`);
        }

        const secId = String(selectedSide.security_id);
        const strikePrice = selectedItem.strike;
        const isAtm = Math.abs(strikePrice - spotPrice) <= 25;
        const realContractLotSize = Number(selectedSide.lot_size || selectedSide.lotSize || lotSize || 65);
        const realTotalQty = lots * realContractLotSize;
        const finalReqMargin = selectedLtp * realTotalQty;

        return {
            status: "success",
            underlyingSecurityId: securityId,
            underlyingExchangeSegment: exchangeSegment,
            spotPrice,
            expiry: currentExpiry,
            optionType,
            lots,
            lotSize: realContractLotSize,
            totalQty: realTotalQty,
            selectedStrike: strikePrice,
            isAtm,
            securityId: secId,
            symbol: `NIFTY_${strikePrice}_${optionType}`,
            liveLtp: selectedLtp,
            requiredMargin: Number(finalReqMargin.toFixed(2)),
            availableBudget: availableBudget !== null ? Number(availableBudget.toFixed(2)) : null,
            usedPercent: usedPercent !== null ? `${usedPercent}%` : null,
            liveAccountBalance: liveAccountBalance !== null ? Number(liveAccountBalance.toFixed(2)) : null,
            bid: Number(selectedSide.top_bid_price || 0),
            ask: Number(selectedSide.top_ask_price || 0)
        };
    }
}

async function selectBestStrike(params) {
    const selector = new StrikeSelector();
    return await selector.selectBestStrike(params);
}

module.exports = {
    StrikeSelector,
    selectBestStrike,
    selectBestOptionStrike: selectBestStrike
};