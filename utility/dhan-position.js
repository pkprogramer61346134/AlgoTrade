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

        // Dhan credentials
        this.clientId =
            options.clientId ||
            config.CLIENT_ID;

        this.accessToken =
            options.accessToken ||
            config.ACCESS_TOKEN;

        this.baseUrl =
            options.baseUrl ||
            config.BASE_URL;
    }


    /**
     * Get Live Positions
     *
     * Dhan /positions API से current positions
     * लेकर केवल useful fields return करेगा.
     */
    async getPosition() {

        const response = await fetch(
            `${this.baseUrl}/positions`,
            {
                method: "GET",

                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "access-token": this.accessToken,
                    "client-id": this.clientId
                }
            }
        );


        const result = await response.json();


        // API Error
        if (!response.ok) {

            return {
                status: "error",
                message:
                    result?.remarks?.error_message ||
                    result?.message ||
                    "Dhan positions API failed"
            };
        }


        // Only useful fields
        const positions = Array.isArray(result)
            ? result.map((position) => ({

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

            }))
            : [];


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