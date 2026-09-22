const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

const candles = JSON.parse(fs.readFileSync(path.join(__dirname, '../candle_data/NIFTY_50_5_2026-09-22_2026-09-22.json'), 'utf8'));

// Test script to test Resistance Rejection / Upper Wick Rejection logic for 10:10 PE trigger
function evaluateConsensusEngine1010(candles, i, strategyConfig, data) {
    const c = candles[i];
    const prevC = i > 0 ? candles[i - 1] : null;

    const r = (data.rvol && data.rvol[i] !== null) ? Number(data.rvol[i]) : 1.0;
    const rsiVal = (data.rsi && data.rsi[i] !== null) ? Number(data.rsi[i]) : 50.0;
    const prevRsi = (data.rsi && i > 0 && data.rsi[i-1] !== null) ? Number(data.rsi[i-1]) : rsiVal;
    const emaVal = (data.emaTrend && data.emaTrend[i] !== null) ? Number(data.emaTrend[i]) : null;
    const vwapVal = (data.vwap && data.vwap[i]) ? Number(data.vwap[i]) : null;
    const stObj = (data.supertrend && data.supertrend[i]) ? data.supertrend[i] : null;
    const atrVal = (data.atr && data.atr[i] !== null) ? Number(data.atr[i]) : 15.0;

    let buyVotes = 0;
    let sellVotes = 0;
    const voteDetails = [];

    // Check Price Action Candle Pattern: Resistance Rejection / Shooting Star / Top Pinbar
    const candleRange = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const isUpperRejection = candleRange > 0 && (upperWick / candleRange) >= 0.35 && c.close < c.open;
    
    // ENGINE 1: Volume Surge (RVOL >= 1.05x)
    const minRVOL = 1.05;
    if (r >= minRVOL) {
        buyVotes++;
        sellVotes++;
        voteDetails.push(`Engine 1 [Volume Surge ${r.toFixed(2)}x >= ${minRVOL}x]: CONFIRMED (+1 Both)`);
    }

    // ENGINE 2: RSI Momentum Velocity & Reversal Slope
    const rsiBull = 54;
    const rsiBear = 46;
    const isRsiDropping = (prevRsi >= 52.0 && rsiVal < prevRsi);
    const isRsiRising = (prevRsi <= 48.0 && rsiVal > prevRsi);

    if (rsiVal > rsiBull || isRsiRising) {
        buyVotes++;
        voteDetails.push(`Engine 2 [RSI ${rsiVal.toFixed(1)}]: BULLISH (+1)`);
    }
    if (rsiVal < rsiBear || isRsiDropping) {
        sellVotes++;
        voteDetails.push(`Engine 2 [RSI ${rsiVal.toFixed(1)} Drop (${prevRsi.toFixed(1)}->${rsiVal.toFixed(1)})]: BEARISH (+1)`);
    }

    // ENGINE 3: 50 EMA & Intraday Resistance Rejection
    if (isUpperRejection) {
        sellVotes++;
        voteDetails.push(`Engine 3 [Top Resistance Rejection / Shooting Star (Wick ${(upperWick/candleRange*100).toFixed(0)}%)]: BEARISH (+1)`);
    } else if (emaVal !== null && c.close > emaVal) {
        buyVotes++;
        voteDetails.push(`Engine 3 [Price ₹${c.close} > EMA ₹${emaVal.toFixed(1)}]: BULLISH TREND (+1)`);
    } else if (emaVal !== null && c.close < emaVal) {
        sellVotes++;
        voteDetails.push(`Engine 3 [Price ₹${c.close} < EMA ₹${emaVal.toFixed(1)}]: BEARISH TREND (+1)`);
    }

    // ENGINE 4: Intraday VWAP Benchmark
    if (vwapVal !== null) {
        if (c.close > vwapVal && !isUpperRejection) {
            buyVotes++;
            voteDetails.push(`Engine 4 [Price ₹${c.close} > VWAP ₹${vwapVal.toFixed(1)}]: BULLISH VWAP (+1)`);
        } else if (c.close < vwapVal || isUpperRejection) {
            sellVotes++;
            voteDetails.push(`Engine 4 [VWAP Rejection / Spot < VWAP]: BEARISH VWAP (+1)`);
        }
    }

    // ENGINE 5: Supertrend Trailing & Price Action Reversal
    const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
    const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");
    const isBullEngulf = prevC && c.close > c.open && c.close > prevC.high;
    const isBearEngulf = prevC && c.close < c.open && c.close < prevC.low;

    if (isStBull || isBullEngulf) {
        buyVotes++;
        voteDetails.push(`Engine 5 [Supertrend/PA ${isStBull ? 'ST Bullish' : 'Bullish Engulfing'}]: BULLISH (+1)`);
    } else if (isStBear || isBearEngulf || isUpperRejection) {
        sellVotes++;
        voteDetails.push(`Engine 5 [Supertrend/PA ${isStBear ? 'ST Bearish' : (isUpperRejection ? 'Top Wick Rejection' : 'Bearish Engulfing')}]: BEARISH (+1)`);
    }

    const minConsensusVotes = 3;
    let signalType = "NONE";

    if (sellVotes >= minConsensusVotes && sellVotes > buyVotes) {
        signalType = "SELL";
    } else if (buyVotes >= minConsensusVotes && buyVotes > sellVotes) {
        signalType = "BUY";
    }

    return {
        time: c.time,
        spot: c.close,
        high: c.high,
        low: c.low,
        buyVotes,
        sellVotes,
        signalType,
        voteDetails
    };
}

const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
const strategyConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c.time >= "09:50" && c.time <= "10:35") {
        const sliced = candles.slice(0, i + 1);
        const data = prepareJSONStrategyData(sliced, strategyConfig);
        const res = evaluateConsensusEngine1010(sliced, i, strategyConfig, data);

        console.log(`⏰ [${res.time}] Spot: ₹${res.spot} (H: ${res.high}, L: ${res.low}) | Buy Votes: ${res.buyVotes} | Sell Votes: ${res.sellVotes} | Signal: ${res.signalType}`);
        res.voteDetails.forEach(v => console.log(`   -> ${v}`));
        if (res.signalType !== "NONE") {
            console.log(`   🚀 *** ${res.signalType} PE SIGNAL TRIGGERED AT ${res.time}! ***`);
        }
        console.log("");
    }
}
