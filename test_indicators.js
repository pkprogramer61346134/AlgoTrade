const indicators = require('./indicators');

console.log("=================================================");
console.log("🚀 Testing Indicators Library");
console.log("=================================================\n");

// 1. Generate sample mock candles
const mockCandles = [];
let price = 24500;
for (let i = 0; i < 50; i++) {
    const open = price;
    const high = open + Math.floor(Math.random() * 20);
    const low = open - Math.floor(Math.random() * 20);
    const close = low + Math.floor(Math.random() * (high - low + 1));
    price = close;

    mockCandles.push({
        index: i + 1,
        date: "2026-09-09",
        time: `${9 + Math.floor(i / 12)}:${(i * 5) % 60}:00 AM`,
        timestamp: 1788927600 + (i * 300),
        open,
        high,
        low,
        close,
        volume: 10000 + Math.floor(Math.random() * 50000)
    });
}

// Test Indicators
console.log("1. Previous Day Levels:", indicators.marketContext.getPreviousDayLevels(mockCandles));
console.log("2. EMA (20):", indicators.trend.calculateEMA(mockCandles, 20).slice(-3));
console.log("3. SMA (20):", indicators.trend.calculateSMA(mockCandles, 20).slice(-3));
console.log("4. VWAP:", indicators.trend.calculateVWAP(mockCandles).slice(-3));
console.log("5. Supertrend:", indicators.trend.calculateSupertrend(mockCandles).slice(-3));
console.log("6. RSI (14):", indicators.momentum.calculateRSI(mockCandles, 14).slice(-3));
console.log("7. MACD:", indicators.momentum.calculateMACD(mockCandles).slice(-3));
console.log("8. ATR (14):", indicators.volatility.calculateATR(mockCandles, 14).slice(-3));
console.log("9. Bollinger Bands:", indicators.volatility.calculateBollingerBands(mockCandles).slice(-3));
console.log("10. Volume Metrics:", indicators.volume.getVolumeMetrics(mockCandles));
console.log("11. Candlestick Patterns:", indicators.priceAction.detectCandlestickPatterns(mockCandles));
console.log("12. Trading Session Window:", indicators.timeFactors.getTradingSessionWindow("9:45:00 AM"));

console.log("\n=================================================");
console.log("✅ All Indicators executed successfully!");
console.log("=================================================");
