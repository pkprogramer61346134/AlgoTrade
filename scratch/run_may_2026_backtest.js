const fs = require('fs');
const path = require('path');
const { CentralCandleDataHub } = require('../src/candleDataHub');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const SpotRiskDeltaCalculator = require('../src/spotRiskDeltaCalculator');

async function runMay2026Backtest() {
    const hub = new CentralCandleDataHub();
    const startDate = '2026-05-01';
    const endDate = '2026-05-31';
    const initialCapital = 100000;

    console.log('===================================================================================');
    console.log(`📊 [MAY 2026 BACKTEST REPORT] Dhan API 100% Real Candle Data (${startDate} to ${endDate})`);
    console.log('===================================================================================');

    const candles = await hub.getCandlesWithWarmup(startDate, endDate, 300);
    const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
    const stratConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

    const preparedData = prepareJSONStrategyData(candles, stratConfig);
    const dailyTradeCounts = {};

    let capital = initialCapital;
    const trades = [];
    let activeTrade = null;

    for (let i = 300; i < candles.length; i++) {
        const c = candles[i];
        if (c.date < startDate || c.date > endDate) continue;

        const timeStr = c.time || '09:15';
        const parts = timeStr.split(':').map(Number);
        const totalMins = parts[0] * 60 + (parts[1] || 0);

        // Active Trade Monitor
        if (activeTrade) {
            const currentSpotPrice = c.close;
            const spotMove = currentSpotPrice - activeTrade.spotEntryPrice;
            const deltaMove = activeTrade.optionType === "CE" ? (spotMove * 0.50) : (-spotMove * 0.50);
            const currentOptionPremium = Math.max(0.5, Number((activeTrade.optionPremiumPrice + deltaMove).toFixed(2)));

            if (currentOptionPremium > activeTrade.highestPremium) {
                activeTrade.highestPremium = currentOptionPremium;
            }

            // DYNAMIC TRAILING SL TO BREAKEVEN: When profit reaches >= 50% of target distance, trail SL to Entry Price!
            const targetDist = activeTrade.target - activeTrade.optionPremiumPrice;
            if (targetDist > 0 && (activeTrade.highestPremium - activeTrade.optionPremiumPrice) >= (targetDist * 0.50)) {
                if (activeTrade.currentSL < activeTrade.optionPremiumPrice) {
                    activeTrade.currentSL = activeTrade.optionPremiumPrice;
                }
            }

            const dualExit = SpotRiskDeltaCalculator.evaluateDualLayerExit({
                currentSpotPrice,
                currentOptionPremium,
                activePosition: activeTrade,
                totalMins
            });

            if (dualExit.exitTriggered) {
                const finalExitPremium = dualExit.exitPrice;
                const ptsPnL = Number((finalExitPremium - activeTrade.optionPremiumPrice).toFixed(2));
                const totalPnL = Number((ptsPnL * activeTrade.quantity).toFixed(2));
                
                capital = Number((capital + totalPnL).toFixed(2));

                trades.push({
                    date: c.date,
                    entryTime: activeTrade.entryTime,
                    exitTime: timeStr,
                    type: activeTrade.optionType,
                    spotEntryPrice: activeTrade.spotEntryPrice,
                    spotExitPrice: currentSpotPrice,
                    spotSL: activeTrade.spotSL,
                    spotTarget: activeTrade.spotTarget,
                    optionPremiumPrice: activeTrade.optionPremiumPrice,
                    exitPremiumPrice: finalExitPremium,
                    pnlRupees: totalPnL,
                    pnlPoints: ptsPnL,
                    exitReason: dualExit.exitReason,
                    balanceAfter: capital,
                    consensusVotes: activeTrade.consensusVotes
                });

                activeTrade = null;
            }
        }

        // New Signal Scan (VWAP Filter + 14/16 Consensus)
        if (!activeTrade && totalMins >= 555 && totalMins < 900) {
            const todayTrades = dailyTradeCounts[c.date] || 0;
            if (todayTrades < 3) {
                const vwapVal = preparedData.vwap ? preparedData.vwap[i] : null;
                const signal = evaluateConsensusEngine(candles, i, stratConfig, preparedData, dailyTradeCounts, false);

                let vwapFilterPassed = true;
                if (vwapVal !== null && vwapVal !== undefined) {
                    if (signal.type === "BUY" && c.close < vwapVal) vwapFilterPassed = false;
                    if (signal.type === "SELL" && c.close > vwapVal) vwapFilterPassed = false;
                }

                if (signal && signal.type !== "NONE" && vwapFilterPassed) {
                    const spotPrice = c.close;
                    const optionType = signal.type === "BUY" ? "CE" : "PE";
                    const optionPremiumPrice = Math.max(20, Math.round(spotPrice * 0.005));
                    const qty = 65; // 1 Lot Nifty

                    const spotStruct = SpotRiskDeltaCalculator.calculateSpotChartStructure({
                        spotPrice,
                        signalType: signal.type,
                        stopLoss: signal.stopLoss,
                        targetPrice: signal.targetPrice,
                        riskRewardRatio: 2.0
                    });

                    const optionDeltaMap = SpotRiskDeltaCalculator.mapSpotToOptionDelta({
                        spotPrice,
                        spotSL: spotStruct.spotSL,
                        spotTarget: spotStruct.spotTarget,
                        optionPremiumPrice,
                        optionType,
                        maxRiskPtsCap: 100,
                        delta: 0.50
                    });

                    activeTrade = {
                        orderId: `MAY_${trades.length + 1}`,
                        mode: "PAPER",
                        status: "ACTIVE",
                        date: c.date,
                        entryTime: timeStr,
                        optionType,
                        spotEntryPrice: spotPrice,
                        spotSL: spotStruct.spotSL,
                        spotTarget: spotStruct.spotTarget,
                        quantity: qty,
                        numLots: 1,
                        optionPremiumPrice,
                        currentPremium: optionPremiumPrice,
                        highestPremium: optionPremiumPrice,
                        initialSL: optionDeltaMap.optionSL,
                        currentSL: optionDeltaMap.optionSL,
                        target: optionDeltaMap.optionTarget,
                        currentTarget: optionDeltaMap.optionTarget,
                        consensusVotes: signal.consensusVotes
                    };
                }
            }
        }
    }

    console.log(`📋 [MAY 2026 TRADES BREAKDOWN] (${trades.length} Total Trades Executed)\n`);
    console.log('-----------------------------------------------------------------------------------');
    let wins = 0;
    let losses = 0;
    let breakevens = 0;
    trades.forEach((t, idx) => {
        if (t.pnlRupees > 0) wins++;
        else if (t.pnlRupees === 0) breakevens++;
        else losses++;
        const icon = t.pnlRupees > 0 ? '🟢 PROFIT' : (t.pnlRupees === 0 ? '⚪ BREAKEVEN' : '🔴 LOSS');
        console.log(`[Trade #${idx + 1}] 📅 ${t.date} 🕒 ${t.entryTime} - ${t.exitTime} IST | NIFTY ${t.type} @ Spot ₹${t.spotEntryPrice}`);
        console.log(`   - Votes            : ${t.consensusVotes}/16 Engines Voted YES`);
        console.log(`   - Spot SL / Target : SL: ₹${t.spotSL} | Target: ₹${t.spotTarget}`);
        console.log(`   - Option Premium   : Entry: ₹${t.optionPremiumPrice} | Exit: ₹${t.exitPremiumPrice} (${t.exitReason})`);
        console.log(`   - Trade PnL        : ${t.pnlRupees >= 0 ? '+' : ''}₹${t.pnlRupees} (${t.pnlPoints >= 0 ? '+' : ''}${t.pnlPoints} pts) | Balance: ₹${t.balanceAfter} [${icon}]`);
        console.log('-----------------------------------------------------------------------------------');
    });

    const netPnL = Number((capital - initialCapital).toFixed(2));
    const winRate = trades.length > 0 ? Number((((wins + breakevens) / trades.length) * 100).toFixed(1)) : 0;

    console.log('\n===================================================================================');
    console.log(`🏆 MAY 2026 FINAL BACKTEST PERFORMANCE SUMMARY`);
    console.log('===================================================================================');
    console.log(`  Initial Capital       : ₹${initialCapital.toLocaleString()}`);
    console.log(`  Final Capital         : ₹${capital.toLocaleString()}`);
    console.log(`  Net Realized PnL (₹)  : ${netPnL >= 0 ? '+' : ''}₹${netPnL} (${(netPnL / initialCapital * 100).toFixed(2)}%)`);
    console.log(`  Total Trades Executed : ${trades.length}`);
    console.log(`  Wins / Losses / BE    : ${wins} Wins / ${losses} Losses / ${breakevens} Breakevens`);
    console.log(`  Capital Protection Rate (Wins + Breakevens) : ${winRate}%`);
    console.log('===================================================================================');
}

runMay2026Backtest().catch(console.error);
