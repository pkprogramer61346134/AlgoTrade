/**
 * HEAD SIGNAL ROUTER & MESSAGER
 * 
 * Class responsible for:
 * 1. Routing consensus trading signals to paperOrderManager and orderManager based on routing settings.
 * 2. Broadcasting consensus telemetry and strategy evaluation logs to Head Terminal UI & Monitor Clients.
 */
class HeadRouter {
    /**
     * @param {Object} [wsConnector] - HeadWS instance
     */
    constructor(wsConnector = null) {
        this.wsConnector = wsConnector;
    }

    setWsConnector(wsConnector) {
        this.wsConnector = wsConnector;
    }

    /**
     * Routes consensus signal to execution engines
     * 
     * @param {Object} singleSignal - Signal object { consensus, confidence, strategyName, entry, sl, tr }
     * @param {string} requesterId - Recipient client ID who requested signal
     * @param {Object} execSettings - Execution settings { paperTradeEnabled, realTradeEnabled, routingMode }
     */
    routeConsensusSignal(singleSignal, requesterId, execSettings = {}) {
        if (!this.wsConnector || !this.wsConnector.isConnected()) return;

        // 1. Send response back to requesting sender (Skip liveMarketClient tick feeder)
        if (requesterId && requesterId !== 'liveMarketClient') {
            this.wsConnector.sendRaw({
                type: 'SEND_MESSAGE',
                recipientId: requesterId,
                payload: {
                    status: 'SUCCESS',
                    action: 'CONSENSUS_SIGNAL_RESPONSE',
                    singleSignal
                }
            });
        }

        // 2. Broadcast signal telemetry to dedicated Head UI
        this.wsConnector.sendRaw({
            type: 'SEND_MESSAGE',
            recipientId: 'headTerminalUI',
            payload: {
                action: 'HEAD_SIGNAL_TELEMETRY',
                singleSignal,
                execSettings,
                timestamp: Date.now()
            }
        });

        // 3. Route signal to Order Managers if signal is BUY or SELL
        if (singleSignal && singleSignal.consensus && singleSignal.consensus !== 'NO_SIGNAL') {
            const isPaperAllowed = execSettings.paperTradeEnabled !== false;
            const isRealAllowed = execSettings.realTradeEnabled === true;
            const mode = (execSettings.routingMode || 'BOTH').toUpperCase();

            // Paper Routing
            if (isPaperAllowed && (mode === 'PAPER' || mode === 'BOTH')) {
                console.log(`📝 [HEAD ROUTER] Forwarding Signal to Paper Manager ("paperOrderManager")...`);
                this.wsConnector.sendRaw({
                    type: 'SEND_MESSAGE',
                    recipientId: 'paperOrderManager',
                    payload: { action: 'CONSENSUS_SIGNAL_RESPONSE', mode: 'PAPER', singleSignal }
                });
            }

            // Real Money Routing
            if (isRealAllowed && (mode === 'REAL' || mode === 'BOTH')) {
                console.log(`🚀 [HEAD ROUTER] Forwarding Signal to Real Order Manager ("orderManager")...`);
                this.wsConnector.sendRaw({
                    type: 'SEND_MESSAGE',
                    recipientId: 'orderManager',
                    payload: { action: 'CONSENSUS_SIGNAL_RESPONSE', mode: 'REAL', singleSignal }
                });
            }
        }
    }
}

module.exports = HeadRouter;
