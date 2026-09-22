const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

const candles = JSON.parse(fs.readFileSync(path.join(__dirname, '../candle_data/NIFTY_50_5_2026-09-22_2026-09-22.json'), 'utf8'));

// Let's modify evaluating logic temporarily in test script to test 10:10 PE trigger
function evaluateConsensusEngineTest(candles, i, strategyConfig, data) {
    const c = candles[i];
    const prevC = i > 0 ? candles[i - 1] : null;
    const prevC2 = i > 1 ? candles[i - 2] : null;

    const r = (data.rvol && data.rvol[i] !== null) ? Number(data.rvol[i]) : 1.0;
    const rsiVal = (data.rsi && data.rsi[i] !== null) ? Number(data.rsi[i]) : 50.0;
    const prevRsi = (data.rsi && i > 0 && data.rsi[i-1] !== null) ? Number(data.rsi[i-1]) : rsiVal;
    const emaVal = (data.emaTrend && data.emaTrend[i] !== null) ? Number(data.emaTrend[i]) : null;
    const vwapVal = (data.vwap && data.vwap[i]) ? Number(data.vwap[i]) : null;
    const stObj = (data.supertrend && data.supertrend[i]) ? data.supertrend[i] : null;

    let buyVotes = 0;
    let sellVotes = 0;
    const voteDetails = [];

    // ENGINE 1: Volume Surge (RVOL >= 1.10x)
    const minRVOL = 1.10;
    if (r >= minRVOL) {
        buyVotes++;
        sellVotes++;
        voteDetails.push(`Engine 1 [Volume Surge ${r.toFixed(2)}x >= ${minRVOL}x]: CONFIRMED (+1 Both)`);
    }

    // ENGINE 2: RSI Momentum & Reversal Velocity
    // Bullish: RSI > 54 OR (RSI rising sharply > 50 and > prevRsi)
    // Bearish: RSI < 48 OR (RSI turning down from >53 to <=53)
    const rsiBull = 54;
    const rsiBear = 48;
    const rsiTurnDown = (prevRsi >= 53.5 && rsiVal < prevRsi);
    const rsiTurnUp = (prevRsi <= 46.5 && rsiVal > prevRsi);

    if (rsiVal > rsiBull || rsiTurnUp) {
        buyVotes++;
        voteDetails.push(`Engine 2 [RSI ${rsiVal.toFixed(1)} ${rsiTurnUp ? 'Turning UP' : '>' + rsiBull}]: BULLISH (+1)`);
    } else if (rsiVal < rsiBear || rsiTurnDown) {
        sellVotes++;
        voteDetails.push(`Engine 2 [RSI ${rsiVal.toFixed(1)} ${rsiTurnDown ? 'Turning DOWN (' + prevRsi.toFixed(1) + '->' + rsiVal.toFixed(1) + ')' : '<' + rsiBear}]: BEARISH (+1)`);
    }

    // ENGINE 3: 50 EMA & Intraday Resistance Rejection
    // Bearish if Spot < EMA OR Upper Wick Rejection near intraday high (Shooting Star / Upper Shadow > 35% of range)
    const candleRange = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const isTopRejection = candleRange > 0 && (upperWick / candleRange) >= 0.35 && c.close < c.open;
    const isBottomRejection = candleRange > 0 && (lowerWick / candleRange) >= 0.35 && c.close > c.open;

    if (emaVal !== null && c.close > emaVal && !isTopRejection) {
        buyVotes++;
        voteDetails.push(`Engine 3 [Price ₹${c.close} > EMA ₹${emaVal.toFixed(1)}]: BULLISH TREND (+1)`);
    } else if (emaVal !== null && (c.close < emaVal || isTopRejection)) {
        sellVotes++;
        voteDetails.push(`Engine 3 [EMA/Top Rejection ${isTopRejection ? 'Shooting Star Top Rejection' : 'Price < EMA'}]: BEARISH TREND (+1)`);
    }

    // ENGINE 4: Intraday VWAP Benchmark & Distance/Rejection
    if (vwapVal !== null) {
        const distToVwap = (c.close - vwapVal);
        // If price is < VWAP OR price is falling back towards VWAP after top rejection
        if (c.close > vwapVal && !isTopRejection) {
            buyVotes++;
            voteDetails.push(`Engine 4 [Price ₹${c.close} > VWAP ₹${vwapVal.toFixed(1)}]: BULLISH VWAP (+1)`);
        } else if (c.close < vwapVal || isTopRejection) {
            sellVotes++;
            voteDetails.push(`Engine 4 [VWAP ${isTopRejection ? 'Top Rejection reversing to VWAP' : 'Price < VWAP'}]: BEARISH VWAP (+1)`);
        }
    }

    // ENGINE 5: Supertrend Trailing & Price Action Engulfing
    const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
    const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");
    const isBullEngulf = prevC && c.close > c.open && c.close > prevC.high;
    const isBearEngulf = prevC && c.close < c.open && c.close < prevC.low;

    if (isStBull || isBullEngulf) {
        buyVotes++;
        voteDetails.push(`Engine 5 [Supertrend/PA ${isStBull ? 'ST Bullish' : 'Bullish Engulfing'}]: BULLISH (+1)`);
    } else if (isStBear || isBearEngulf) {
        sellVotes++;
        voteDetails.push(`Engine 5 [Supertrend/PA ${isStBear ? 'ST Bearish' : 'Bearish Engulfing'}]: BEARISH (+1)`);
    }

    return {
        time: c.time,
        spot: c.close,
        high: c.high,
        low: c.low,
        buyVotes,
        sellVotes,
        voteDetails
    };
}

const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
const strategyConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

console.log("-----------------------------------------------------------------------------------------");
console.log("⏱️ EVALUATING CANDLES FROM 09:50 TO 10:30 WITH TOP REJECTION & RSI TURNOVER LOGIC");
console.log("-----------------------------------------------------------------------------------------\n");

for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c.time >= "09:50" && c.time <= "10:35") {
        const sliced = candles.slice(0, i + 1);
        const data = prepareJSONStrategyData(sliced, strategyConfig);
        const res = evaluateConsensusEngineTest(sliced, i, strategyConfig, data);

        console.log(`⏰ [${res.time}] Spot: ₹${res.spot} (H: ${res.high}, L: ${res.low}) | Buy Votes: ${res.buyVotes} | Sell Votes: ${res.sellVotes}`);
        res.voteDetails.forEach(v => console.log(`   -> ${v}`));
        if (res.sellVotes >= 3) {
            console.log(`   🚀 *** 🔴 PE SIGNAL TRIGGERED AT ${res.time}! ***`);
        }
        console.log("");
    }
}
