const fs = require('fs');
const path = require('path');
const { DhanSDK } = require('./index');
const dhan = new DhanSDK();

const BANKNIFTY_SECURITY_ID = "25";
const EXCHANGE_SEGMENT = "IDX_I";
const INSTRUMENT_TYPE = "INDEX";

const { getCandleDataDir } = require('../indicators/utils/dataLoader');
const CACHE_DIR = getCandleDataDir();

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/**
 * 📅 Fetch BANK NIFTY Historical Candles for Date with Local Disk Caching
 */
async function getBankNiftyCandlesByDate(customDate, interval = "5", customToDate = null) {
    const targetDate = customDate || new Date().toISOString().split('T')[0];
    const endDate = customToDate || targetDate;

    ensureCacheDir();
    const cacheFileName = `BANK_NIFTY_${interval}_${targetDate}_${endDate}.json`;
    const cacheFilePath = path.join(CACHE_DIR, cacheFileName);

    if (fs.existsSync(cacheFilePath)) {
        try {
            const rawCache = fs.readFileSync(cacheFilePath, 'utf-8');
            const cachedCandles = JSON.parse(rawCache);
            if (Array.isArray(cachedCandles) && cachedCandles.length > 0) {
                console.log(`📂 [LOCAL DISK CACHE HIT] Loaded ${cachedCandles.length} BANK NIFTY candles for '${targetDate}' to '${endDate}' from disk ('${cacheFileName}')!`);
                return cachedCandles;
            }
        } catch (e) {
            console.warn(`⚠️ Error reading disk cache '${cacheFileName}': ${e.message}`);
        }
    }

    const response = await dhan.marketData.getIntradayData({
        securityId: BANKNIFTY_SECURITY_ID,
        exchangeSegment: EXCHANGE_SEGMENT,
        instrument: INSTRUMENT_TYPE,
        interval: String(interval),
        fromDate: targetDate,
        toDate: endDate
    });

    if (response.status === 'success' && response.data) {
        const rawData = response.data;
        const formattedCandles = [];

        if (rawData.timestamp && rawData.timestamp.length > 0) {
            for (let i = 0; i < rawData.timestamp.length; i++) {
                const dateObj = new Date(rawData.timestamp[i] * 1000);
                const timeStr = dateObj.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
                const dateStr = dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

                formattedCandles.push({
                    index: i + 1,
                    date: dateStr,
                    time: timeStr,
                    timestamp: rawData.timestamp[i],
                    open: rawData.open[i],
                    high: rawData.high[i],
                    low: rawData.low[i],
                    close: rawData.close[i],
                    volume: rawData.volume ? rawData.volume[i] : 0
                });
            }

            if (formattedCandles.length > 0) {
                try {
                    fs.writeFileSync(cacheFilePath, JSON.stringify(formattedCandles, null, 2), 'utf-8');
                    console.log(`💾 [LOCAL DISK CACHE SAVED] Cached ${formattedCandles.length} BANK NIFTY candles to disk ('${cacheFileName}')!`);
                } catch (e) {
                    console.warn(`⚠️ Error saving disk cache '${cacheFileName}': ${e.message}`);
                }
            }

            return formattedCandles;
        }
        return [];
    }
    return [];
}

/**
 * 🔔 PRICE ALERT WITH 2 CANDLES (PREVIOUS CLOSED + CURRENT ACTIVE) FOR BANK NIFTY
 * Gives AI both Previous Closed Candle & Current Active Candle to make AI trading decisions!
 */
function setBankNiftyPriceAlert(config = {}) {
    const targetPrice = config.targetPrice || 52500;
    const condition = (config.condition || 'ABOVE').toUpperCase();
    let alertTriggered = false;

    console.log(`\n🔔 Price Alert Set for BANK NIFTY: Target ${targetPrice} (${condition})`);

    const checkTriggerCondition = (currentPrice, sourceLabel = "Socket Tick") => {
        if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0 || alertTriggered) return;

        let isTriggered = false;
        if (condition === 'ABOVE' && currentPrice >= targetPrice) {
            isTriggered = true;
        } else if (condition === 'BELOW' && currentPrice <= targetPrice) {
            isTriggered = true;
        }

        if (isTriggered && !alertTriggered) {
            alertTriggered = true;

            const alertPayload = {
                symbol: 'BANK NIFTY',
                securityId: BANKNIFTY_SECURITY_ID,
                targetPrice: targetPrice,
                currentPrice: currentPrice,
                condition: condition,
                source: sourceLabel,
                time: new Date().toLocaleTimeString('en-IN')
            };

            console.log('\n======================================================');
            console.log(`🚨 ALERT TRIGGERED FOR AI! BANK NIFTY crossed ${condition} ₹${targetPrice}! (${sourceLabel})`);
            console.log(`⏰ Time: ${alertPayload.time} | Current Price: ₹${currentPrice}`);
            console.log('======================================================\n');

            if (typeof config.onAlert === 'function') {
                config.onAlert(alertPayload);
            }

            // Fetch candles asynchronously in background for logging
            const today = new Date().toISOString().split('T')[0];
            getBankNiftyCandlesByDate(today, "5").then(candles => {
                if (candles && candles.length >= 2) {
                    alertPayload.previousCandle = { label: "Previous Closed Candle", ...candles[candles.length - 2] };
                    alertPayload.currentCandle = { label: "Current Active Candle", ...candles[candles.length - 1] };
                }
            }).catch(() => {});
        }
    };

    // 1. Instant Initial Quote Check
    dhan.marketData.getMarketQuote({ IDX_I: [25] }).then(quoteRes => {
        const rootData = quoteRes?.data?.data || quoteRes?.data || quoteRes;
        const segData = rootData?.IDX_I || {};
        const secData = segData[25] || segData["25"] || {};
        const initialLtp = secData.last_price || rootData?.last_price;
        if (initialLtp) {
            checkTriggerCondition(parseFloat(initialLtp), "Instant Quote Check");
        }
    }).catch(() => {});

    // 2. Real-Time Socket Feed Listener
    const liveFeed = dhan.initLiveFeed({
        onTick: (tickData) => {
            let currentPrice = null;

            if (typeof tickData === 'object' && tickData !== null && tickData.ltp) {
                currentPrice = parseFloat(tickData.ltp);
            } else if (typeof tickData === 'string') {
                try {
                    const parsed = JSON.parse(tickData);
                    currentPrice = parseFloat(parsed.ltp || parsed.close || parsed.price);
                } catch (e) {}
            } else if (Buffer.isBuffer(tickData) && tickData.length >= 12) {
                try {
                    const ltpVal = tickData.readFloatLE(8);
                    if (ltpVal > 1000) currentPrice = ltpVal;
                } catch (e) {}
            }

            if (currentPrice) {
                checkTriggerCondition(currentPrice, "Live Feed Socket");
            }
        }
    });

    liveFeed.connect();

    setTimeout(() => {
        liveFeed.subscribe([{ ExchangeSegment: EXCHANGE_SEGMENT, SecurityId: BANKNIFTY_SECURITY_ID }]);
    }, 1500);
}

module.exports = {
    getBankNiftyCandlesByDate,
    setBankNiftyPriceAlert
};
