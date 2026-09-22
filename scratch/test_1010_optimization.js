const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

const candles = JSON.parse(fs.readFileSync(path.join(__dirname, '../candle_data/NIFTY_50_5_2026-09-22_2026-09-22.json'), 'utf8'));

// Let's inspect detailed technical indicators at 10:10
const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
const strategyConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

const i1010 = candles.findIndex(c => c.time === "10:10");
console.log("Index for 10:10 candle:", i1010);

const sliced = candles.slice(0, i1010 + 1);
const data = prepareJSONStrategyData(sliced, strategyConfig);

console.log("\nIndicators at 10:10 AM Candle:");
console.log("Spot Close:", candles[i1010].close);
console.log("Spot High:", candles[i1010].high);
console.log("Spot Low:", candles[i1010].low);
console.log("Spot Open:", candles[i1010].open);
console.log("RSI (14):", data.rsi[i1010]);
console.log("EMA 50:", data.ema50[i1010]);
console.log("VWAP:", data.vwap[i1010]);
console.log("RVOL:", data.rvol[i1010]);
console.log("Supertrend Direction:", data.supertrend ? data.supertrend[i1010] : 'N/A');

// Let's check 10:05 vs 10:10 RSI & VWAP distance & Candlestick pattern
console.log("\n10:05 Candle Close:", candles[i1010-1].close, "RSI:", data.rsi[i1010-1]);
console.log("RSI Delta (10:10 vs 10:05):", data.rsi[i1010] - data.rsi[i1010-1]);
