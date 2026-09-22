/**
 * Test Simple & Clean 3-Indicator Strategy (Supertrend + VWAP + RVOL)
 */

const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

const candles = JSON.parse(fs.readFileSync(path.join(__dirname, '../candle_data/NIFTY_50_5_2026-09-22_2026-09-22.json'), 'utf8'));

const simpleConfig = {
    id: "consensus_master_head",
    name: "Clean 3-Indicator Strategy (Supertrend + VWAP + RVOL)",
    enabled: true,
    maxTradesPerDay: 2,
    riskRewardRatio: 2.0,
    entryStartTime: "09:30",
    entryEndTime: "14:30",
    entryStartMins: 570,
    entryEndMins: 870,
    indicators: {
        rvolMin: 1.25,
        supertrendPeriod: 10,
        supertrendMultiplier: 3
    }
};

function evaluateSimpleStrategy(candles, i, config, data, dailyTradeCounts) {
    const c = candles[i];
    if (i < 3) return { type: "NONE" };

    if (c.time) {
        const parts = c.time.split(':').map(Number);
        const mins = parts[0] * 60 + parts[1];
        if (mins < config.entryStartMins || mins >= config.entryEndMins) return { type: "NONE" };
    }

    if ((dailyTradeCounts[c.date] || 0) >= config.maxTradesPerDay) return { type: "NONE" };

    const rvolVal = (data.rvol && data.rvol[i] !== null) ? Number(data.rvol[i]) : 1.0;
    const vwapVal = (data.vwap && data.vwap[i]) ? Number(data.vwap[i]) : null;
    const stObj = (data.supertrend && data.supertrend[i]) ? data.supertrend[i] : null;
    const atrVal = (data.atr && data.atr[i] !== null) ? Number(data.atr[i]) : 15.0;

    const minRVOL = config.indicators.rvolMin || 1.25;
    const isVolumeSurge = rvolVal >= minRVOL;
    const isStBull = stObj && (stObj.direction === 1 || stObj.direction === "UP" || stObj.direction === "BUY");
    const isStBear = stObj && (stObj.direction === -1 || stObj.direction === "DOWN" || stObj.direction === "SELL");

    let signalType = "NONE";
    const reasoningDetails = [];

    // CE BUY Condition: Supertrend Bullish + Spot > VWAP + RVOL >= 1.25x
    if (isStBull && vwapVal !== null && c.close > vwapVal && isVolumeSurge) {
        signalType = "BUY";
        reasoningDetails.push(`Supertrend BULLISH | Spot ₹${c.close} > VWAP ₹${vwapVal.toFixed(1)} | Volume Surge ${rvolVal.toFixed(2)}x >= ${minRVOL}x`);
    }
    // PE SELL Condition: Supertrend Bearish + Spot < VWAP + RVOL >= 1.25x
    else if (isStBear && vwapVal !== null && c.close < vwapVal && isVolumeSurge) {
        signalType = "SELL";
        reasoningDetails.push(`Supertrend BEARISH | Spot ₹${c.close} < VWAP ₹${vwapVal.toFixed(1)} | Volume Surge ${rvolVal.toFixed(2)}x >= ${minRVOL}x`);
    }

    if (signalType !== "NONE") {
        const spotPrice = c.close;
        const dynamicSLPoints = Math.max(15.0, Math.min(35.0, atrVal * 1.5));
        let sl = signalType === "BUY" ? (spotPrice - dynamicSLPoints) : (spotPrice + dynamicSLPoints);
        const risk = Math.abs(spotPrice - sl);
        const rrMultiplier = config.riskRewardRatio || 2.0;
        const dynamicTRPoints = risk * rrMultiplier;
        let tp = signalType === "BUY" ? (spotPrice + dynamicTRPoints) : (spotPrice - dynamicTRPoints);

        return {
            type: signalType,
            entryPrice: spotPrice,
            stopLoss: Number(sl.toFixed(2)),
            targetPrice: Number(tp.toFixed(2)),
            reasoning: `👑 SIMPLE STRATEGY TRIGGERED: ${signalType === "BUY" ? "BULLISH CE" : "BEARISH PE"} Entry @ ₹${spotPrice}. ${reasoningDetails.join(" | ")}`
        };
    }

    return { type: "NONE" };
}

function runTest() {
    console.log("=========================================================================================");
    console.log("🧪 TESTING SIMPLE & CLEAN 3-INDICATOR STRATEGY (SUPERTREND + VWAP + RVOL)");
    console.log("=========================================================================================\n");

    const data = prepareJSONStrategyData(candles, simpleConfig);
    const initialCapital = 100000;
    let runningCapital = initialCapital;
    let activeTrade = null;
    const completedTrades = [];
    const dailyTradeCounts = {};

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];

        if (activeTrade) {
            const currentPrem = activeTrade.optionType === "CE" 
                ? activeTrade.optionPremiumPrice + (c.close - activeTrade.spotEntryPrice) * 0.5
                : activeTrade.optionPremiumPrice + (activeTrade.spotEntryPrice - c.close) * 0.5;

            const isCEHitSL = activeTrade.optionType === "CE" && c.low <= activeTrade.spotSL;
            const isCEHitTP = activeTrade.optionType === "CE" && c.high >= activeTrade.spotTarget;
            const isPEHitSL = activeTrade.optionType === "PE" && c.high >= activeTrade.spotSL;
            const isPEHitTP = activeTrade.optionType === "PE" && c.low <= activeTrade.spotTarget;

            let exitReason = null;
            let exitPrice = c.close;
            let exitPremium = currentPrem;

            if (isCEHitSL || isPEHitSL) {
                exitReason = "SL HIT";
                exitPrice = activeTrade.spotSL;
                exitPremium = activeTrade.optionSL;
            } else if (isCEHitTP || isPEHitTP) {
                exitReason = "TARGET HIT";
                exitPrice = activeTrade.spotTarget;
                exitPremium = activeTrade.target;
            } else if (c.time >= "15:00") {
                exitReason = "3:00 PM EOD";
                exitPrice = c.close;
                exitPremium = currentPrem;
            }

            if (exitReason) {
                const ptsPnl = Number((exitPremium - activeTrade.optionPremiumPrice).toFixed(2));
                const rupeePnl = Number((ptsPnl * activeTrade.quantity).toFixed(2));
                runningCapital += rupeePnl;

                completedTrades.push({
                    tradeNo: completedTrades.length + 1,
                    entryTime: activeTrade.entryTime,
                    exitTime: c.time,
                    optionType: activeTrade.optionType,
                    spotEntryPrice: activeTrade.spotEntryPrice,
                    spotExitPrice: exitPrice,
                    entryPremium: activeTrade.optionPremiumPrice,
                    exitPremium: Number(exitPremium.toFixed(2)),
                    ptsPnl,
                    rupeePnl,
                    exitReason,
                    isWin: rupeePnl >= 0
                });

                console.log(`🔴 [EXIT AT ${c.time}] ${exitReason} | Exit Premium: ₹${exitPremium.toFixed(2)} | Spot Exit: ₹${exitPrice} | PnL: ${rupeePnl >= 0 ? '+' : ''}₹${rupeePnl.toLocaleString()} (${ptsPnl >= 0 ? '+' : ''}${ptsPnl} pts)`);
                activeTrade = null;
            }
        }

        const result = evaluateSimpleStrategy(candles, i, simpleConfig, data, dailyTradeCounts);
        if (result.type !== "NONE" && !activeTrade) {
            const optionType = result.type === "BUY" ? "CE" : "PE";
            const spotPrice = c.close;
            const NIFTY_LOT_SIZE = 65;
            const estPremium = Math.max(80, Math.min(250, spotPrice * 0.005));
            const numLots = Math.max(1, Math.floor(runningCapital / (estPremium * NIFTY_LOT_SIZE)));
            const qty = numLots * NIFTY_LOT_SIZE;

            const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
                spotPrice,
                signalType: result.type,
                stopLoss: result.stopLoss,
                targetPrice: result.targetPrice,
                riskRewardRatio: 2.0
            });

            const deltaMap = SpotRiskDeltaCalculator.mapSpotToOptionDelta({
                spotPrice,
                spotSL: spotStruct.spotSL,
                spotTarget: spotStruct.spotTarget,
                optionPremiumPrice: estPremium,
                optionType,
                delta: 0.50
            });

            activeTrade = {
                entryTime: c.time,
                optionType,
                spotEntryPrice: spotPrice,
                spotSL: spotStruct.spotSL,
                spotTarget: spotStruct.spotTarget,
                optionPremiumPrice: Number(estPremium.toFixed(2)),
                optionSL: Number(deltaMap.optionSL.toFixed(2)),
                target: Number(deltaMap.optionTarget.toFixed(2)),
                quantity: qty
            };

            dailyTradeCounts[c.date] = (dailyTradeCounts[c.date] || 0) + 1;
            console.log(`🟢 [ENTRY AT ${c.time}] ${optionType} ENTRY @ Spot ₹${spotPrice} | Premium ₹${estPremium.toFixed(2)} | SL: ₹${spotStruct.spotSL} | Target: ₹${spotStruct.spotTarget}`);
        }
    }

    console.log("\n=========================================================================================");
    console.log("📈 PERFORMANCE SUMMARY (SIMPLE 3-INDICATOR STRATEGY)");
    console.log("=========================================================================================");
    const totalTrades = completedTrades.length;
    const wins = completedTrades.filter(t => t.isWin).length;
    const netPnL = Number((runningCapital - initialCapital).toFixed(2));

    console.log(`💼 Starting Capital     : ₹${initialCapital.toLocaleString()}`);
    console.log(`💰 Final Ending Capital : ₹${runningCapital.toLocaleString()}`);
    console.log(`💵 Net Realized PnL    : ${netPnL >= 0 ? '+' : ''}₹${netPnL.toLocaleString()} (${((netPnL/initialCapital)*100).toFixed(2)}%)`);
    console.log(`📊 Total Trades        : ${totalTrades}`);
    console.log(`🟢 Winning Trades      : ${wins}`);
    console.log(`🔴 Losing Trades       : ${totalTrades - wins}`);
    console.log(`🎯 Win Rate            : ${totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0}%`);
    console.log("-----------------------------------------------------------------------------------------\n");

    if (totalTrades > 0) {
        console.table(completedTrades.map(t => ({
            "#": t.tradeNo,
            "Time": `${t.entryTime} -> ${t.exitTime}`,
            "Contract": `NIFTY ${t.optionType}`,
            "Spot Entry": `₹${t.spotEntryPrice}`,
            "Spot Exit": `₹${t.spotExitPrice}`,
            "Prem Entry": `₹${t.entryPremium}`,
            "Prem Exit": `₹${t.exitPremium}`,
            "PnL (₹)": `${t.rupeePnl >= 0 ? '+' : ''}₹${t.rupeePnl.toLocaleString()}`,
            "PnL (pts)": `${t.ptsPnl >= 0 ? '+' : ''}${t.ptsPnl} pts`,
            "Exit Reason": t.exitReason
        })));
    }
}

runTest();
