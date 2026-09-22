const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const LiquiditySweepStrategy = require('../src/liquiditySweepStrategy');

function testPECaptureWithZoneTuning(threshold = 4, lowerWickMax = 50.0) {
    const todayFilePath = path.join(__dirname, '..', 'candle_data', 'NIFTY_50_5_2026-09-22_2026-09-22.json');
    const candles = JSON.parse(fs.readFileSync(todayFilePath, 'utf8'));
    const stratPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    let strategyConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    console.log(`\n=================================================================================`);
    console.log(`🧪 TESTING PE CAPTURE WITH LOWER WICK MAX = ${lowerWickMax}% & THRESHOLD = ${threshold}/10`);
    console.log(`=================================================================================\n`);

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (c.time >= "10:15" && c.time <= "11:15") {
            const data = prepareJSONStrategyData(candles.slice(0, i + 1), strategyConfig);
            const evalIdx = candles.slice(0, i + 1).length - 1;
            
            const rsiVal = (data.rsi && data.rsi[evalIdx] !== null) ? Number(data.rsi[evalIdx]) : 50;
            const vwapVal = (data.vwap && data.vwap[evalIdx]) ? Number(data.vwap[evalIdx]) : null;
            const stObj = (data.supertrend && data.supertrend[evalIdx]) ? data.supertrend[evalIdx] : null;
            const prevC = i > 0 ? candles[i - 1] : null;

            let sellVotes = 0;
            const voteDetails = [];

            if (rsiVal < 46) { sellVotes++; voteDetails.push(`RSI ${rsiVal.toFixed(1)} < 46`); }
            if (vwapVal && c.close < vwapVal) { sellVotes++; voteDetails.push(`Price < VWAP ${vwapVal.toFixed(1)}`); }
            if (stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL")) { sellVotes++; voteDetails.push(`Supertrend DOWN`); }
            if (prevC && c.close < c.open && c.close < prevC.low) { sellVotes++; voteDetails.push(`Bearish Engulfing`); }

            const range = Math.max(0.1, c.high - c.low);
            const lowerWickPct = ((Math.min(c.open, c.close) - c.low) / range) * 100;
            const isBlocked = lowerWickPct >= lowerWickMax;

            console.log(`⏰ [${c.time}] Spot: ₹${c.close} | Sell Votes: ${sellVotes} | Lower Wick: ${lowerWickPct.toFixed(1)}% | Blocked: ${isBlocked ? 'YES' : 'NO'}`);
            if (sellVotes >= threshold && !isBlocked) {
                console.log(`   🎯 PE TRADE WOULD TRIGGER HERE AT ${c.time}! Spot Entry: ₹${c.close} | Engines: ${voteDetails.join(", ")}`);
            }
        }
    }
}

testPECaptureWithZoneTuning(4, 50.0);
testPECaptureWithZoneTuning(4, 35.0);
