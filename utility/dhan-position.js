/**
 * Dhan Live Position Model
 *
 * Only one main function:
 *     getPosition()
 *
 * This module is ONLY for LIVE positions.
 */

const config = require("./token/config");

class DhanPosition {

    constructor(options = {}) {
        this.options = options;
    }

    getAuth() {
        try {
            delete require.cache[require.resolve("./token/config")];
            const freshConfig = require("./token/config");
            return {
                clientId: this.options.clientId || freshConfig.CLIENT_ID,
                accessToken: this.options.accessToken || freshConfig.ACCESS_TOKEN,
                baseUrl: this.options.baseUrl || freshConfig.BASE_URL
            };
        } catch (e) {
            return {
                clientId: this.options.clientId || config.CLIENT_ID,
                accessToken: this.options.accessToken || config.ACCESS_TOKEN,
                baseUrl: this.options.baseUrl || config.BASE_URL
            };
        }
    }

    /**
     * Get Live Positions
     *
     * Dhan /positions API से current positions
     * लेकर केवल useful fields return करेगा.
     */
    async getPosition() {
        const auth = this.getAuth();

        const response = await fetch(
            `${auth.baseUrl}/positions`,
            {
                method: "GET",

                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "access-token": auth.accessToken,
                    "client-id": auth.clientId
                }
            }
        );


        const result = await response.json();


        // API Error
        if (!response.ok) {

            return {
                status: "error",
                message:
                    (result?.errorMessage
                        ? `${result.errorCode ? result.errorCode + " - " : ""}${result.errorMessage}`
                        : null) ||
                    result?.remarks?.error_message ||
                    result?.message ||
                    "Dhan positions API failed"
            };
        }


        // Only useful fields - support Array response, result.data, or result.positions
        const rawArray = Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : (Array.isArray(result?.positions) ? result.positions : []));
        const positions = rawArray.map((position) => ({

                tradingSymbol: position.tradingSymbol,
                securityId: position.securityId,

                positionType: position.positionType,
                productType: position.productType,

                buyAvg: position.buyAvg,
                buyQty: position.buyQty,

                sellAvg: position.sellAvg,
                sellQty: position.sellQty,

                netQty: position.netQty,

                realizedProfit: position.realizedProfit,
                unrealizedProfit: position.unrealizedProfit,

                drvExpiryDate: position.drvExpiryDate,
                drvOptionType: position.drvOptionType,
                drvStrikePrice: position.drvStrikePrice

            }));


        return {
            status: "success",
            mode: "live",
            data: positions
        };
    }
}


module.exports = {
    DhanPosition
};