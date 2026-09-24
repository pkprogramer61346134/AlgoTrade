const { DhanSDK } = require('../dhanAPI');
const DhanOptionStrikeFetcher = require('../dhanAPI/optionStrikeFetcher');

/**
 * LIVE TRACK PnL MANAGER
 * 
 * Class responsible for:
 * 1. fetchDhanLivePosition - Fetching live position and server unrealized PnL directly from Dhan API GET /positions.
 * 2. fetchLiveOptionLtp - Fetching real-time live Option Strike LTP from Dhan Market Data API.
 * 3. calculateLivePnL - Calculating live unrealized PnL, PnL percentage, and Risk-Reward ratio.
 */
class LiveTrackPnL {
    constructor() {
        this.dhan = new DhanSDK();
        this.strikeFetcher = new DhanOptionStrikeFetcher();
    }

    /**
     * Method 1: Queries GET /positions directly from Dhan API servers.
     * Returns official pre-calculated Dhan server unrealizedProfit, buyAvg, netQty, etc.
     * 
     * @param {string} [securityId] - Security ID to match
     * @param {string} [symbol] - Trading symbol to match
     * @returns {Promise<Object|null>} Dhan live position details or null
     */
    async fetchDhanLivePosition(securityId = null, symbol = null) {
        if (!this.dhan || typeof this.dhan.portfolio?.getPositions !== 'function') return null;

        try {
            const posRes = await this.dhan.portfolio.getPositions();
            const posList = Array.isArray(posRes?.data) ? posRes.data : (Array.isArray(posRes) ? posRes : []);

            const getNetQty = (p) => {
                if (p.netQty !== undefined && p.netQty !== null) return Number(p.netQty);
                if (p.positionQty !== undefined && p.positionQty !== null) return Number(p.positionQty);
                return 0;
            };

            const getSecId = (p) => String(p.securityId || p.security_id || p.secId || '');
            const getSym = (p) => String(p.tradingSymbol || p.symbol || p.customSymbol || '');

            const secIdStr = securityId ? String(securityId) : '';
            const symStr = symbol ? String(symbol) : '';

            // Find matching active position
            const liveMatch = posList.find(p => {
                const pSecId = getSecId(p);
                const pSym = getSym(p);
                if (secIdStr && pSecId && secIdStr === pSecId) return true;
                if (symStr && pSym && (symStr === pSym || pSym.includes(symStr) || symStr.includes(pSym))) return true;
                return getNetQty(p) > 0;
            });

            if (liveMatch) {
                const netQty = getNetQty(liveMatch);
                const officialBuyAvg = Number(liveMatch.buyAvg || liveMatch.costPrice || 0);
                const serverUnrealizedPnl = Number(liveMatch.unrealizedProfit || liveMatch.unrealizedPnl || 0.0);
                const derivedLtp = netQty > 0 ? Number((officialBuyAvg + (serverUnrealizedPnl / netQty)).toFixed(2)) : officialBuyAvg;

                return {
                    found: true,
                    symbol: getSym(liveMatch),
                    securityId: getSecId(liveMatch),
                    netQty,
                    buyAvg: officialBuyAvg,
                    unrealizedPnl: serverUnrealizedPnl,
                    realizedPnl: Number(liveMatch.realizedProfit || liveMatch.realizedPnl || 0.0),
                    derivedLtp
                };
            }

            return { found: false, posList };
        } catch (err) {
            console.warn(`⚠️ [LIVE TRACK PnL] Dhan Position Fetch Error: ${err.message}`);
            return null;
        }
    }

    /**
     * Method 2: Fetches real-time live Option LTP directly from Dhan API.
     * 
     * @param {number} strikePrice - Strike price (e.g. 23200)
     * @param {string} optionType - 'CE' or 'PE'
     * @param {string} [securityId] - Dhan Security ID
     * @returns {Promise<number>} Live option LTP
     */
    async fetchLiveOptionLtp(strikePrice, optionType, securityId = null) {
        try {
            const ltp = await this.strikeFetcher.fetchLiveOptionLtp(strikePrice, optionType, securityId);
            return Number((ltp || 0).toFixed(2));
        } catch (e) {
            console.warn(`⚠️ [LIVE TRACK PnL] Option LTP Fetch Warning: ${e.message}`);
            return 0;
        }
    }

    /**
     * Method 3: Calculates Live PnL, PnL percentage, and Risk-Reward metrics for an active position.
     * 
     * @param {Object} activePosition - Active position object { symbol, entryPrice, qty, riskPoints, highestPriceSeen }
     * @param {number} currentLtp - Current option LTP
     * @returns {Object} Updated live PnL metrics object
     */
    calculateLivePnL(activePosition, currentLtp) {
        if (!activePosition || !currentLtp || currentLtp <= 0) return null;

        const entryPrice = activePosition.entryPrice || 0;
        const qty = activePosition.qty || 65;
        const ltp = Number(currentLtp.toFixed(2));

        const pnlPerShare = ltp - entryPrice;
        const unrealizedPnl = Number((pnlPerShare * qty).toFixed(2));
        const pnlPercentage = entryPrice > 0 ? Number(((pnlPerShare / entryPrice) * 100).toFixed(2)) : 0.0;

        const highestPrice = Math.max(activePosition.highestPriceSeen || entryPrice, ltp);
        const riskPts = activePosition.riskPoints && activePosition.riskPoints > 0 ? activePosition.riskPoints : 15.0;
        const gainedPoints = highestPrice - entryPrice;
        const rrRatio = Number((gainedPoints / riskPts).toFixed(2));

        return {
            symbol: activePosition.symbol,
            entryPrice,
            currentLtp: ltp,
            qty,
            unrealizedPnl,
            pnlPercentage,
            highestPriceSeen: highestPrice,
            rrRatioText: `1:${rrRatio}`,
            isProfit: unrealizedPnl >= 0
        };
    }
}

module.exports = LiveTrackPnL;
