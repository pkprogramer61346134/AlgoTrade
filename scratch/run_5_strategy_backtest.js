const path = require('path');
const { candleDataHub } = require('../Candlehub/candleDataHub');
const { evaluateConsensusEngine, loadStrategyConfig } = require('../head/consensusEngine');

/**
 * 5-STRATEGY COMPREHENSIVE BACKTEST VERIFICATION RUNNER
 * Evaluates all 5 quantitative strategies in head/consensus_master_head.json
 */
async function run5StrategyBacktest() {
    console.log('===========================================================');
    console.log('📊 [QUANT BACKTEST RUNNER] Evaluating 5 Head Strategies...');
    console.log('===========================================================');

    // Load Strategy Config
    const config = loadStrategyConfig();
    const strategies = config.strategies || [];

    console.log(`✅ Loaded ${strategies.length} Master Strategies from consensus_master_head.json:\n`);
    strategies.forEach((s, idx) => {
        console.log(`   ${idx + 1}. [${s.id}] ${s.name} (Estimated Winrate: ${s.winrate}, RR: 1:${s.riskRewardRatio})`);
    });
    console.log('-----------------------------------------------------------\n');

    // Load Historical Candles (e.g. 2026-09-01 to 2026-09-22 or available dataset)
    const candles = await candleDataHub.getCandles('2026-09-01', '2026-09-22', 'NIFTY_50', '5');

    if (!candles || candles.length === 0) {
        console.error('❌ Failed to load historical dataset for backtest!');
        return;
    }

    console.log(`📊 Loaded ${candles.length} 5-Minute Candles for Backtest Evaluation...\n`);

    const initialCapital = 100000.0;
    const resultsByStrategy = {};

    for (const strat of strategies) {
        resultsByStrategy[strat.id] = {
            id: strat.id,
            name: strat.name,
            trades: [],
            wins: 0,
            losses: 0,
            totalNetPnl: 0.0,
            virtualBalance: initialCapital,
            isPositionActive: false,
            activePos: null
        };
    }

    const trailingSteps = [1.5, 2.5, 3.0, 3.5, 4.0, 5.0];

    for (let i = 50; i < candles.length; i++) {
        const bar = candles[i];
        const candlesSlice = candles.slice(0, i + 1);

        for (const strat of strategies) {
            const res = resultsByStrategy[strat.id];

            // 1. Process active trade
            if (res.isPositionActive && res.activePos) {
                const pos = res.activePos;
                const spotHigh = bar.high;
                const spotLow = bar.low;
                const spotClose = bar.close;

                const spotDiffHigh = spotHigh - pos.spotEntryPrice;
                const spotDiffLow = spotLow - pos.spotEntryPrice;
                const spotDiffClose = spotClose - pos.spotEntryPrice;

                const estOptionHigh = pos.optionType === 'CE' ? pos.entryPrice + (spotDiffHigh * 0.50) : pos.entryPrice - (spotDiffLow * 0.50);
                const estOptionLow = pos.optionType === 'CE' ? pos.entryPrice + (spotDiffLow * 0.50) : pos.entryPrice - (spotDiffHigh * 0.50);
                const estOptionClose = pos.optionType === 'CE' ? pos.entryPrice + (spotDiffClose * 0.50) : pos.entryPrice - (spotDiffClose * 0.50);

                pos.currentLtp = Number(Math.max(1, estOptionClose).toFixed(2));
                if (estOptionHigh > pos.highestPriceSeen) pos.highestPriceSeen = Number(estOptionHigh.toFixed(2));

                const tpTargetPrice = pos.entryPrice + (pos.riskPoints * strat.riskRewardRatio);

                // Check Target Profit Hit
                if (estOptionHigh >= tpTargetPrice) {
                    const exitPrice = Number(tpTargetPrice.toFixed(2));
                    const netPnl = Number(((exitPrice - pos.entryPrice) * pos.qty).toFixed(2));
                    
                    res.wins++;
                    res.totalNetPnl = Number((res.totalNetPnl + netPnl).toFixed(2));
                    res.virtualBalance = Number((res.virtualBalance + netPnl).toFixed(2));

                    res.trades.push({
                        openedAt: pos.openedAt,
                        closedAt: `${bar.date} ${bar.time}`,
                        symbol: pos.symbol,
                        entryPrice: pos.entryPrice,
                        exitPrice,
                        netPnl,
                        reason: 'TARGET_PROFIT_HIT'
                    });

                    res.isPositionActive = false;
                    res.activePos = null;
                    continue;
                }

                // Check Trailing SL Hit or EOD Auto Cut
                if (estOptionLow <= pos.currentTrailingSL || bar.time >= '15:15') {
                    const exitPrice = Number(Math.max(1, pos.currentTrailingSL).toFixed(2));
                    const netPnl = Number(((exitPrice - pos.entryPrice) * pos.qty).toFixed(2));
                    
                    if (netPnl >= 0) res.wins++;
                    else res.losses++;

                    res.totalNetPnl = Number((res.totalNetPnl + netPnl).toFixed(2));
                    res.virtualBalance = Number((res.virtualBalance + netPnl).toFixed(2));

                    res.trades.push({
                        openedAt: pos.openedAt,
                        closedAt: `${bar.date} ${bar.time}`,
                        symbol: pos.symbol,
                        entryPrice: pos.entryPrice,
                        exitPrice,
                        netPnl,
                        reason: bar.time >= '15:15' ? 'AUTO_CUT_315' : 'TRAILING_SL_HIT'
                    });

                    res.isPositionActive = false;
                    res.activePos = null;
                    continue;
                }

                // Evaluate Trailing SL Step
                const gainedPoints = pos.highestPriceSeen - pos.entryPrice;
                const currentRRRatio = gainedPoints / pos.riskPoints;

                for (let stepIdx = trailingSteps.length - 1; stepIdx >= 0; stepIdx--) {
                    const milestoneRatio = trailingSteps[stepIdx];
                    if (currentRRRatio >= milestoneRatio && stepIdx > pos.currentMilestoneIndex) {
                        pos.currentMilestoneIndex = stepIdx;
                        const lockedRRatio = Math.max(0, milestoneRatio - 1.0);
                        const newSL = Number((pos.entryPrice + (lockedRRatio * pos.riskPoints)).toFixed(2));
                        if (newSL > pos.currentTrailingSL) {
                            pos.currentTrailingSL = newSL;
                        }
                        break;
                    }
                }
            }

            // 2. Evaluate Strategy Entry Signal
            if (!res.isPositionActive && bar.time >= '09:30' && bar.time <= '14:45') {
                const triggeredSignals = evaluateConsensusEngine(candles, i, {});
                const stratSignal = triggeredSignals.find(s => s.strategyId === strat.id);

                if (stratSignal && stratSignal.type !== 'NONE') {
                    const spotPrice = bar.close;
                    const optionType = (stratSignal.type === 'BUY') ? 'CE' : 'PE';
                    const strikePrice = Math.round(spotPrice / 50) * 50;
                    const symbol = `NIFTY_${strikePrice}_${optionType}`;
                    const entryPrice = 120.50; // Base premium + 0.50 slippage
                    const riskPoints = 12.0; // Optimized risk points
                    const initialSL = Number((entryPrice - riskPoints).toFixed(2));

                    res.activePos = {
                        symbol,
                        optionType,
                        spotEntryPrice: spotPrice,
                        entryPrice,
                        currentLtp: entryPrice,
                        initialSL,
                        currentTrailingSL: initialSL,
                        highestPriceSeen: entryPrice,
                        riskPoints,
                        currentMilestoneIndex: -1,
                        qty: 50,
                        openedAt: `${bar.date} ${bar.time}`
                    };

                    res.isPositionActive = true;
                }
            }
        }
    }

    console.log('===========================================================');
    console.log('🏆 [FINAL 5-STRATEGY BACKTEST RESULTS REPORT]');
    console.log('===========================================================');

    let totalCombinedPnl = 0;

    for (const strat of strategies) {
        const res = resultsByStrategy[strat.id];
        const totalTrades = res.wins + res.losses;
        const winrate = totalTrades > 0 ? ((res.wins / totalTrades) * 100).toFixed(1) : '0.0';
        const returnPercent = (((res.totalNetPnl) / initialCapital) * 100).toFixed(2);

        totalCombinedPnl += res.totalNetPnl;

        console.log(`📌 Strategy: ${res.name} (${res.id})`);
        console.log(`   - Total Trades: ${totalTrades} (Wins: ${res.wins}, Losses: ${res.losses})`);
        console.log(`   - Win Rate: ${winrate}%`);
        console.log(`   - Total Net PnL: ${res.totalNetPnl >= 0 ? '+' : ''}₹${res.totalNetPnl} (${returnPercent}% Return)`);
        console.log(`   - Ending Balance: ₹${res.virtualBalance}`);
        console.log('-----------------------------------------------------------');
    }

    const overallReturnPercent = (((totalCombinedPnl) / initialCapital) * 100).toFixed(2);
    console.log(`\n👑 [MASTER HEAD COMBINED PORTFOLIO RETURN]`);
    console.log(`   - Capital Allocated: ₹${initialCapital}`);
    console.log(`   - Total Combined Net Profit: ${totalCombinedPnl >= 0 ? '+' : ''}₹${totalCombinedPnl.toFixed(2)}`);
    console.log(`   - Overall Master Return: ${overallReturnPercent}%`);
    console.log('===========================================================');
}

run5StrategyBacktest().catch(err => console.error(err));
