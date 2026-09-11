/**
 * Dhan API Complete Module for SocialAI
 * Verified with Dhan HQ v2 Official Documentation (https://dhanhq.co/docs/v2/)
 * 
 * Features Covered:
 * - Funds & Margin Calculator (/fundlimit, /margincalculator)
 * - Orders (Regular, Super Orders / Bracket Orders, Slice Orders, Forever/GTT Orders)
 * - Trade Book, Order Book & Ledger Statements
 * - Portfolio (Holdings, Intraday Positions, Position Conversion)
 * - Market & Chart Data (1m/5m/15m Intraday, Historical Daily, Expired Option Rolling Charts, Option Chain Matrix, Expiries, Snapshot Quotes, Market Status)
 * - User Profile & EDIS / T-PIN Generation
 * - Real-Time Live Feed WebSocket (wss://api-feed.dhan.co)
 */

let defaultConfig = { CLIENT_ID: '', ACCESS_TOKEN: '', BASE_URL: 'https://api.dhan.co/v2' };
try {
    defaultConfig = require('./config');
} catch (e) {
    // config.js is optional
}

class DhanClient {
    constructor(config = {}) {
        this.clientId = config.clientId || defaultConfig.CLIENT_ID || '';
        this.accessToken = config.accessToken || defaultConfig.ACCESS_TOKEN || '';
        this.baseUrl = config.baseUrl || defaultConfig.BASE_URL || 'https://api.dhan.co/v2';
    }

    setCredentials(clientId, accessToken) {
        this.clientId = clientId;
        this.accessToken = accessToken;
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'access-token': this.accessToken,
            'client-id': this.clientId
        };
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = { ...this.getHeaders(), ...(options.headers || {}) };

        const config = {
            method: options.method || 'GET',
            headers: headers,
        };

        if (options.body) {
            config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401 && !options.isRetry) {
                    console.warn(`⚠️ [DHAN API] HTTP 401 Unauthorized detected for ${endpoint}. Triggering auto token refresh...`);
                    try {
                        const { ensureValidDhanToken } = require('./autoTokenRefresh');
                        const refreshRes = await ensureValidDhanToken(true);
                        if (refreshRes && refreshRes.accessToken) {
                            this.setCredentials(refreshRes.clientId, refreshRes.accessToken);
                            console.log("🔄 [DHAN API] Retrying request with fresh access token...");
                            return await this.request(endpoint, { ...options, isRetry: true });
                        }
                    } catch (refErr) {
                        console.error(`❌ Auto token refresh retry failed: ${refErr.message}`);
                    }
                }

                return {
                    status: 'error',
                    statusCode: response.status,
                    message: data.remarks?.error_message || data.message || 'API call failed',
                    errorData: data
                };
            }

            return { status: 'success', statusCode: response.status, data: data };
        } catch (error) {
            return { status: 'error', message: error.message || 'Network error' };
        }
    }

    get(endpoint) { return this.request(endpoint, { method: 'GET' }); }
    post(endpoint, body) { return this.request(endpoint, { method: 'POST', body }); }
    put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body }); }
    delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }
}

/**
 * 1. Funds & Margin Services
 */
class DhanFunds {
    constructor(client) { this.client = client; }
    
    // GET /fundlimit
    async getFundLimits() { return await this.client.get('/fundlimit'); }
    
    // POST /margincalculator
    async calculateMargin(params = {}) {
        return await this.client.post('/margincalculator', {
            dhanClientId: this.client.clientId,
            exchangeSegment: params.exchangeSegment,
            transactionType: params.transactionType,
            quantity: params.quantity,
            productType: params.productType,
            securityId: params.securityId,
            price: params.price || 0,
            triggerPrice: params.triggerPrice || 0
        });
    }
}

/**
 * 2. Orders & Execution Services
 */
class DhanOrders {
    constructor(client) { this.client = client; }
    
    // POST /orders
    async placeOrder(params = {}) {
        return await this.client.post('/orders', {
            dhanClientId: this.client.clientId,
            correlationId: params.correlationId || `ORD_${Date.now()}`,
            transactionType: params.transactionType,
            exchangeSegment: params.exchangeSegment,
            productType: params.productType,
            orderType: params.orderType,
            validity: params.validity || 'DAY',
            tradingSymbol: params.tradingSymbol || '',
            securityId: params.securityId,
            quantity: params.quantity,
            disclosedQuantity: params.disclosedQuantity || 0,
            price: params.price || 0,
            triggerPrice: params.triggerPrice || 0,
            afterMarketOrder: params.afterMarketOrder || false,
            amoTime: params.amoTime || 'OPEN',
            boProfitValue: params.boProfitValue || 0,
            boStopLossValue: params.boStopLossValue || 0
        });
    }

    // PUT /orders/{order-id}
    async modifyOrder(orderId, params = {}) {
        return await this.client.put(`/orders/${orderId}`, {
            dhanClientId: this.client.clientId,
            orderId: orderId,
            orderType: params.orderType,
            quantity: params.quantity,
            price: params.price || 0,
            triggerPrice: params.triggerPrice || 0,
            disclosedQuantity: params.disclosedQuantity || 0,
            validity: params.validity || 'DAY'
        });
    }

    // DELETE /orders/{order-id}
    async cancelOrder(orderId) { return await this.client.delete(`/orders/${orderId}`); }

    // GET /orders
    async getOrderList() { return await this.client.get('/orders'); }

    // GET /orders/{order-id}
    async getOrderById(orderId) { return await this.client.get(`/orders/${orderId}`); }

    // GET /trades
    async getTradeHistory() { return await this.client.get('/trades'); }

    // GET /trades/{order-id}
    async getTradeByOrderId(orderId) { return await this.client.get(`/trades/${orderId}`); }

    // POST /orders/slicing
    async placeSliceOrder(params = {}) {
        return await this.client.post('/orders/slicing', {
            dhanClientId: this.client.clientId,
            transactionType: params.transactionType,
            exchangeSegment: params.exchangeSegment,
            productType: params.productType,
            orderType: params.orderType,
            validity: params.validity || 'DAY',
            securityId: params.securityId,
            quantity: params.quantity,
            price: params.price || 0,
            triggerPrice: params.triggerPrice || 0
        });
    }

    // POST /super/orders (Official DhanHQ v2 Super Order endpoint)
    async placeSuperOrder(params = {}) {
        return await this.client.post('/super/orders', {
            dhanClientId: this.client.clientId,
            correlationId: params.correlationId || `SUPER_${Date.now()}`,
            transactionType: params.transactionType,
            exchangeSegment: params.exchangeSegment,
            productType: params.productType || 'INTRADAY',
            orderType: params.orderType || 'LIMIT',
            securityId: params.securityId,
            quantity: params.quantity,
            price: params.price,
            targetPrice: params.targetPrice,
            stopLossPrice: params.stopLossPrice,
            trailingJump: params.trailingJump || 0
        });
    }

    // PUT /super/orders/{super-order-id} (Official DhanHQ v2 Modify Super Order endpoint)
    async modifySuperOrder(superOrderId, params = {}) {
        return await this.client.put(`/super/orders/${superOrderId}`, {
            dhanClientId: this.client.clientId,
            orderId: superOrderId,
            orderType: params.orderType || 'LIMIT',
            legName: params.legName || 'TARGET_LEG',
            quantity: params.quantity,
            price: params.price || 0,
            targetPrice: params.targetPrice || params.price || 0,
            stopLossPrice: params.stopLossPrice || params.stopLoss || 0
        });
    }

    // DELETE /super/orders/{super-order-id}/{leg-name} (Official DhanHQ v2 Cancel Super Order Leg endpoint)
    async cancelSuperOrder(superOrderId, legName = 'ENTRY_LEG') {
        return await this.client.delete(`/super/orders/${superOrderId}/${legName}`);
    }

    // GET /super/orders
    async getSuperOrders() { return await this.client.get('/super/orders'); }

    // POST /forever/orders
    async placeForeverOrder(params = {}) {
        return await this.client.post('/forever/orders', {
            dhanClientId: this.client.clientId,
            orderFlag: params.orderFlag || 'SINGLE',
            transactionType: params.transactionType,
            exchangeSegment: params.exchangeSegment,
            productType: params.productType || 'CNC',
            orderType: params.orderType || 'LIMIT',
            validity: 'DAY',
            securityId: params.securityId,
            quantity: params.quantity,
            price: params.price,
            triggerPrice: params.triggerPrice,
            price1: params.price1 || 0,
            triggerPrice1: params.triggerPrice1 || 0
        });
    }

    // PUT /forever/orders/{order-id}
    async modifyForeverOrder(orderId, params = {}) {
        return await this.client.put(`/forever/orders/${orderId}`, params);
    }

    // DELETE /forever/orders/{order-id}
    async cancelForeverOrder(orderId) {
        return await this.client.delete(`/forever/orders/${orderId}`);
    }

    // GET /forever/orders
    async getForeverOrders() { return await this.client.get('/forever/orders'); }
}

/**
 * 3. Portfolio & Position Services
 */
class DhanPortfolio {
    constructor(client) { this.client = client; }
    
    // GET /holdings
    async getHoldings() { return await this.client.get('/holdings'); }

    // GET /positions
    async getPositions() { return await this.client.get('/positions'); }

    // POST /positions/convert
    async convertPosition(params = {}) {
        return await this.client.post('/positions/convert', {
            dhanClientId: this.client.clientId,
            fromProductType: params.fromProductType,
            toProductType: params.toProductType,
            exchangeSegment: params.exchangeSegment,
            positionType: params.positionType || 'DIRECT',
            securityId: params.securityId,
            convertQty: params.convertQty
        });
    }
}

/**
 * 4. Market & Chart Data Services
 */
class DhanMarketData {
    constructor(client) { this.client = client; }

    // POST /charts/intraday
    async getIntradayData(params = {}) {
        return await this.client.post('/charts/intraday', {
            securityId: String(params.securityId),
            exchangeSegment: params.exchangeSegment,
            instrument: params.instrument,
            interval: String(params.interval || '5'),
            fromDate: params.fromDate,
            toDate: params.toDate,
            oi: params.oi || false
        });
    }

    // POST /charts/historical
    async getDailyHistoricalData(params = {}) {
        return await this.client.post('/charts/historical', {
            securityId: String(params.securityId),
            exchangeSegment: params.exchangeSegment,
            instrument: params.instrument,
            fromDate: params.fromDate,
            toDate: params.toDate
        });
    }

    // POST /charts/rollingoption (Historical chart for expired options & Greeks)
    async getRollingOptionData(params = {}) {
        return await this.client.post('/charts/rollingoption', params);
    }

    // POST /optionchain
    async getOptionChain(underlyingSecurityId, underlyingExchangeSegment, expiry) {
        return await this.client.post('/optionchain', {
            UnderlyingScrip: Number(underlyingSecurityId),
            UnderlyingSeg: underlyingExchangeSegment,
            Expiry: expiry
        });
    }

    // POST /optionchain/expirylist
    async getOptionChainExpiries(underlyingSecurityId, underlyingExchangeSegment) {
        return await this.client.post('/optionchain/expirylist', {
            UnderlyingScrip: Number(underlyingSecurityId),
            UnderlyingSeg: underlyingExchangeSegment
        });
    }

    // POST /marketfeed/quote
    async getMarketQuote(requestPayload = {}) {
        let body = requestPayload;
        if (Array.isArray(requestPayload)) {
            body = {};
            requestPayload.forEach(item => {
                const seg = item.exchangeSegment || item.ExchangeSegment || "IDX_I";
                const secId = Number(item.securityId || item.SecurityId);
                if (!body[seg]) body[seg] = [];
                if (!body[seg].includes(secId)) body[seg].push(secId);
            });
        }
        return await this.client.post('/marketfeed/quote', body);
    }

    // GET /marketfeed/market-status
    async getMarketStatus() {
        return await this.client.get('/marketfeed/market-status');
    }
}

/**
 * 5. User Profile, Statement & EDIS T-PIN Services
 */
class DhanUser {
    constructor(client) { this.client = client; }

    // GET /user/profile
    async getProfile() { return await this.client.get('/user/profile'); }

    // GET /ledger
    async getLedger(fromDate, toDate) {
        return await this.client.get(`/ledger?fromDate=${fromDate}&toDate=${toDate}`);
    }

    // GET /edis/tpin
    async generateEdisTpin() { return await this.client.get('/edis/tpin'); }
}

/**
 * 6. Live Feed WebSocket Stream Client
 */
class DhanLiveFeed {
    constructor(config = {}) {
        this.clientId = config.clientId || defaultConfig.CLIENT_ID || '';
        this.accessToken = config.accessToken || defaultConfig.ACCESS_TOKEN || '';
        this.authType = config.authType || 2;
        this.onTick = config.onTick || null;
        this.wsUrl = `wss://api-feed.dhan.co?version=2&token=${this.accessToken}&clientId=${this.clientId}&authType=${this.authType}`;
        this.socket = null;
        this.isConnected = false;
        this.subscribedInstruments = [];
    }

    connect() {
        const WebSocketImpl = typeof WebSocket !== 'undefined' ? WebSocket : (typeof require !== 'undefined' ? require('ws') : null);
        if (!WebSocketImpl) return;

        this.socket = new WebSocketImpl(this.wsUrl);
        this.socket.onopen = () => {
            this.isConnected = true;
            if (this.subscribedInstruments.length > 0) {
                this.subscribe(this.subscribedInstruments);
            }
        };
        this.socket.onmessage = (event) => {
            if (this.onTick) this.onTick(event.data);
        };
        this.socket.onclose = () => { this.isConnected = false; };
    }

    subscribe(instrumentList = []) {
        this.subscribedInstruments = instrumentList;
        if (!this.isConnected || !this.socket) return;
        this.socket.send(JSON.stringify({
            RequestCode: 15, // Ticker Mode
            InstrumentCount: instrumentList.length,
            InstrumentList: instrumentList
        }));
    }

    unsubscribe(instrumentList = []) {
        if (!this.isConnected || !this.socket) return;
        this.socket.send(JSON.stringify({
            RequestCode: 16,
            InstrumentCount: instrumentList.length,
            InstrumentList: instrumentList
        }));
    }

    close() { if (this.socket) this.socket.close(); }
}

/**
 * Main Dhan Combined SDK
 */
class DhanSDK {
    constructor(config = {}) {
        this.client = new DhanClient(config);
        this.funds = new DhanFunds(this.client);
        this.orders = new DhanOrders(this.client);
        this.portfolio = new DhanPortfolio(this.client);
        this.marketData = new DhanMarketData(this.client);
        this.user = new DhanUser(this.client);
        this.liveFeed = null;
    }

    setCredentials(clientId, accessToken) {
        this.client.setCredentials(clientId, accessToken);
    }

    initLiveFeed(options = {}) {
        this.liveFeed = new DhanLiveFeed({
            clientId: this.client.clientId,
            accessToken: this.client.accessToken,
            ...options
        });
        return this.liveFeed;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    const { autoRefreshDhanToken, ensureValidDhanToken } = require('./autoTokenRefresh');
    module.exports = {
        DhanSDK,
        DhanClient,
        DhanFunds,
        DhanOrders,
        DhanPortfolio,
        DhanMarketData,
        DhanUser,
        DhanLiveFeed,
        autoRefreshDhanToken,
        ensureValidDhanToken
    };
} else {
    window.DhanSDK = DhanSDK;
}
