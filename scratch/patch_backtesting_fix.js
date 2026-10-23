// One-off patch for server/backtesting/backtesting.js (preserves CRLF line endings)
const fs = require('fs');
const f = 'c:/AlgoTrade/server/backtesting/backtesting.js';
let s = fs.readFileSync(f, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
const lines = (a) => a.join(nl);
let n = 0;
function rep(from, to) { if (!s.includes(from)) throw new Error('pattern not found:\n' + from); s = s.replace(from, () => { n++; return to; }); }

// 1) remove random BUY/SELL coin-flip
rep(lines([
    '                const isHeads = Math.random() < 0.5;',
    '                consensusResult.consensus = isHeads ? "BUY" : "SELL";',
    '                dailyTradeCountMap[dayKey] = currentDayTrades + 1;'
]), lines([
    '                // NOTE: direction comes ONLY from the consensus engine (random BUY/SELL coin-flip removed).',
    '                dailyTradeCountMap[dayKey] = currentDayTrades + 1;'
]));

// 2) same-candle SL/target ambiguity -> SL first (conservative), BUY side
rep(lines([
    '                    // Target पहले check करो (अगर same candle में दोनों hit हुए तो optimistic)',
    '                    if (candleHigh >= activePosition.targetPrice) isTargetHit = true;',
    '                    else if (candleLow <= activePosition.slPrice) isSLHit = true;'
]), lines([
    '                    // SL पहले check करो — अगर same candle में दोनों hit हुए तो conservative (SL मानो),',
    '                    // क्योंकि candle के अंदर का order पता नहीं होता; optimistic मानने से backtest inflate होता है।',
    '                    if (candleLow <= activePosition.slPrice) isSLHit = true;',
    '                    else if (candleHigh >= activePosition.targetPrice) isTargetHit = true;'
]));

// 3) SELL side
rep(lines([
    '                    if (candleLow <= activePosition.targetPrice) isTargetHit = true;',
    '                    else if (candleHigh >= activePosition.slPrice) isSLHit = true;'
]), lines([
    '                    if (candleHigh >= activePosition.slPrice) isSLHit = true;',
    '                    else if (candleLow <= activePosition.targetPrice) isTargetHit = true;'
]));

fs.writeFileSync(f, s, 'utf8');
console.log('patched', n, 'blocks');
