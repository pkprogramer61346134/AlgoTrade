/**
 * Strike Price Selector
 * Location: C:\AlgoTrade\server\classoforder\strickprice\strike-price-selector.js
 *
 * select-best-strike.js से best strike + Delta लाता है।
 * अगर Delta live नहीं मिली, तो वहाँ estimate हो जाती है और deltaSource='ESTIMATED' आता है।
 */

const { selectBestOptionStrike } = require('../../../utility/usedfull/select-best-strike');

class StrikePriceSelector {
    async getBestStrike(stockInfo, amount, optionType, spotPrice) {
        const strikeInfo = await selectBestOptionStrike({
            ...stockInfo,
            spotPrice: Number(spotPrice),
            optionType,
            maxBudget: Number(amount)
        });

        if (!strikeInfo || strikeInfo.status !== 'success' || !strikeInfo.securityId) {
            throw new Error('[STRIKE PRICE SELECTOR] No suitable strike price found within the given amount');
        }

        // Delta होना अनिवार्य है (LIVE या ESTIMATED, दोनों में से कोई एक)
        const delta = Number(strikeInfo.delta);
        if (!Number.isFinite(delta) || delta <= 0 || delta > 1) {
            throw new Error(
                `[STRIKE PRICE SELECTOR] Invalid Delta received: ${strikeInfo.delta} (source=${strikeInfo.deltaSource || 'unknown'})`
            );
        }

        return strikeInfo;
    }
}

module.exports = new StrikePriceSelector();