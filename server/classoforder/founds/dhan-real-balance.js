const { DhanFunds } = require('../../../utility/dhan-funds');

class DhanRealBalance {
    async getBalance() {
        const funds = new DhanFunds();
        const response = await funds.getFundLimits();

        if (
            !response ||
            response.status !== 'success' ||
            !response.data
        ) {
            throw new Error('Failed to fetch real balance from Dhan API');
        }

        const balance = Number(
            response.data.availableBalance ??
            response.data.availabelBalance ??
            response.data.withdrawableBalance
        );

        if (!Number.isFinite(balance)) {
            throw new Error('Invalid balance returned by Dhan API');
        }

        return balance;
    }
}

module.exports = new DhanRealBalance();