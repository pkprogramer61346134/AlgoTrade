
const { SmartOrderExecutor } = require('../../../utility/usedfull/smart-order-executor');

class OrderManager {
    constructor() {
        this.executor = new SmartOrderExecutor();
    }

    // Only Super Order placement function
    async placeSuperOrder(orderDetails) {
        if (!orderDetails || typeof orderDetails !== 'object') {
            throw new Error('Order details are required');
        }

        const {
            securityId,
            exchangeSegment = 'NSE_FNO',
            transactionType = 'BUY',
            lots,
            lotSize,
            price = 0,
            targetPrice,
            stopLossPrice,
            trailingJump = 0
        } = orderDetails;

        // Validate required parameters
        if (!securityId) {
            throw new Error('securityId is required');
        }

        if (!Number.isInteger(Number(lots)) || Number(lots) < 1) {
            throw new Error('lots must be at least 1');
        }

        if (!Number.isInteger(Number(lotSize)) || Number(lotSize) < 1) {
            throw new Error('lotSize must be at least 1');
        }

        if (!Number.isFinite(Number(targetPrice)) || Number(targetPrice) <= 0) {
            throw new Error('Valid targetPrice is required for Super Order');
        }

        if (!Number.isFinite(Number(stopLossPrice)) || Number(stopLossPrice) <= 0) {
            throw new Error('Valid stopLossPrice is required for Super Order');
        }

        if (!['BUY', 'SELL'].includes(String(transactionType).toUpperCase())) {
            throw new Error('transactionType must be BUY or SELL');
        }

        const orderPayload = {
            securityId: String(securityId),
            exchangeSegment,
            transactionType: String(transactionType).toUpperCase(),
            lots: Number(lots),
            lotSize: Number(lotSize),
            price: Number(price),
            targetPrice: Number(targetPrice),
            stopLossPrice: Number(stopLossPrice),
            trailingJump: Number(trailingJump)
        };

        try {
            console.log('[SUPER ORDER] Placing order:', orderPayload);

            const result = await this.executor.placeOptionOrder(orderPayload);

            if (result?.orderType !== 'SUPER_ORDER') {
                throw new Error(
                    'Super Order was not confirmed by SmartOrderExecutor'
                );
            }

            console.log(
                '[SUPER ORDER] Result:',
                JSON.stringify(result, null, 2)
            );

            return result;
        } catch (error) {
            console.error('[SUPER ORDER ERROR]', error.message);
            throw error;
        }
    }
}

module.exports = new OrderManager();
