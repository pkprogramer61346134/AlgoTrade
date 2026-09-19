const { candleDataHub } = require('../src/candleDataHub');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');
const fs = require('fs');

(async () => {
    const baseConfig = JSON.parse(fs.readFileSync('./strategies_config/consensus_master_head.json', 'utf8'));

    console.log('===================================================================================================================');
    console.log('🔬 QUANTITATIVE PARAMETER GRID-SEARCH OPTIMIZATION (MULTI-YEAR HISTORICAL AUDIT)');
    console.log('===================================================================================================================\n');

    const years = ['2024', '2025', '2026'];
    const monthNames = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

    // Load multi-year candle datasets
    const allYearData = [];
    for (const yr of years) {
        for (const mm of monthNames) {
            if (yr === '2026' && parseInt(mm) > 9) break;

            const daysInMonth = new Date(parseInt(yr), parseInt(mm), 0).getDate();
            const startStr = `${yr}-${mm}-01`;
            const endStr = `${yr}-${mm}-${daysInMonth < 10 ? '0' + daysInMonth : daysInMonth}`;

            try {
                const candles = await candleDataHub.getCandlesWithWarmup(startStr, endStr, 300);
                if (candles && candles.length > 0) {
                    allYearData.push({ startStr, endStr, candles });
                }
            } catch (e) {}
        }
    }

    console.log(`✅ Loaded ${allYearData.length} monthly candle datasets across 2024, 2025, 2026.\n`);

    // Grid Search Combinations to test
    const gridSearchCandidates = [
        { name: 'Candidate 1 (Default: RVOL 1.2x, RSI 52, Votes 11, Fixed 1:2.0)', rvol: 1.2, rsiBull: 52, adx: 20, votes: 11, rr: 2.0 },
        { name: 'Candidate 2 (Mined: RVOL 1.25x, RSI 54, Votes 13, Fixed 1:2.0)', rvol: 1.25, rsiBull: 54, adx: 20, votes: 13, rr: 2.0 },
        { name: 'Candidate 3 (Strict Vol: RVOL 1.35x, RSI 55, Votes 13, Fixed 1:2.0)', rvol: 1.35, rsiBull: 55, adx: 22, votes: 13, rr: 2.0 },
        { name: 'Candidate 4 (High Conviction: RVOL 1.25x, RSI 54, Votes 14, Fixed 1:2.5)', rvol: 1.25, rsiBull: 54, adx: 20, votes: 14, rr: 2.5 },
        { name: 'Candidate 5 (High Trend: RVOL 1.25x, RSI 55, Votes 13, Fixed 1:3.0)', rvol: 1.25, rsiBull: 55, adx: 22, votes: 13, rr: 3.0 },
        { name: 'Candidate 6 (Ultra Mined: RVOL 1.30x, RSI 54, Votes 13, Fixed 1:2.0)', rvol: 1.30, rsiBull: 54, adx: 20, votes: 13, rr: 2.0 }
    ];

    function runCandidateBacktest(candles, cand) {
        const testCfg = JSON.parse(JSON.stringify(baseConfig));
        testCfg.riskRewardRatio = cand.rr;
        testCfg.consensusThreshold = cand.votes;
        testCfg.indicators = testCfg.indicators || {};
        testCfg.indicators.rvolMin = cand.rvol;
        testCfg.indicators.rsiBullMin = cand.rsiBull;
        testCfg.indicators.rsiBearMax = 100 - cand.rsiBull;

        const data = prepareJSONStrategyData(candles, testCfg);
        const dailyTradeCounts = {};
        const trades = [];
        let openTrade = null;

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];

            if (openTrade) {
                const isBuy = openTrade.type === 'BUY';
                let exitPrice = null;

                if (isBuy) {
                    if (c.low <= openTrade.stopLoss) exitPrice = openTrade.stopLoss;
                    else if (c.high >= openTrade.targetPrice) exitPrice = openTrade.targetPrice;
                } else {
                    if (c.high >= openTrade.stopLoss) exitPrice = openTrade.stopLoss;
                    else if (c.low <= openTrade.targetPrice) exitPrice = openTrade.targetPrice;
                }

                if (!exitPrice && c.time && (c.time.includes('15:00') || c.time.includes('3:00 pm') || c.time.includes('15:05'))) {
                    exitPrice = c.close;
                }

                if (exitPrice) {
                    const pts = isBuy ? (exitPrice - openTrade.entryPrice) : (openTrade.entryPrice - exitPrice);
                    const pnl = Number((pts * openTrade.qty).toFixed(2));
                    trades.push({ ...openTrade, pnl });
                    openTrade = null;
                }
            }

            if (!openTrade) {
                if (cand.adx > 0) {
                    const currADX = data.adx && data.adx[i] !== null ? data.adx[i] : 20;
                    if (currADX < cand.adx) continue;
                }

                const signal = evaluateConsensusEngine(candles, i, testCfg, data, dailyTradeCounts);
                if (signal && signal.type !== 'NONE') {
                    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
                    const targetPts = Number((risk * cand.rr).toFixed(2));
                    const targetPrice = signal.type === 'BUY'
                        ? Number((signal.entryPrice + targetPts).toFixed(2))
                        : Number((signal.entryPrice - targetPts).toFixed(2));

                    openTrade = {
                        date: c.date,
                        type: signal.type,
                        entryPrice: signal.entryPrice,
                        stopLoss: signal.stopLoss,
                        targetPrice,
                        qty: 65
                    };
                }
            }
        }

        return trades;
    }

    const gridResults = [];

    for (const cand of gridSearchCandidates) {
        let totalPnL = 0;
        let totalTrades = 0;
        let totalWins = 0;

        for (const item of allYearData) {
            const trades = runCandidateBacktest(item.candles, cand).filter(t => t.date >= item.startStr && t.date <= item.endStr);
            const pnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
            totalPnL += pnl;
            totalTrades += trades.length;
            totalWins += trades.filter(t => t.pnl > 0).length;
        }

        const wr = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(2) : '0.00';

        gridResults.push({
            'Strategy Candidate Name': cand.name,
            'Total Net PnL (₹)': `${totalPnL >= 0 ? '+' : ''}₹${Math.round(totalPnL).toLocaleString()}`,
            'Win Rate %': `${wr}%`,
            'Total Trades': totalTrades,
            'Wins / Losses': `${totalWins} / ${totalTrades - totalWins}`
        });
    }

    console.table(gridResults);

    console.log('===================================================================================================================');
    console.log('🏆 BEST MULTI-YEAR OPTIMIZED PARAMETER CANDIDATE FOUND!');
    console.log('===================================================================================================================\n');
})();
