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
            throw new Error('No suitable strike price found within the given amount');
        }

        return strikeInfo;
    }
}

module.exports = new StrikePriceSelector();