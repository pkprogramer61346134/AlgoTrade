/**
 * Honest strategy search on REAL cached NIFTY 15m candles (C:\AlgoTrade\candle_data)
 *
 *  - Uses the PRODUCTION rule logic (evaluateSingleStrategy from consensusEngine.js,
 *    loaded without modifying that file).
 *  - NO coin-flip on direction (backtesting.js lines 267-268 randomise BUY/SELL!).
 *  - Conservative fills: if SL and target are both inside one candle -> SL is assumed first.
 *  - Walk-forward split: ranked on TRAIN days, verified on unseen TEST days.
 *  - Does NOT touch master_strategy.json. Writes results to scratch/best_real_strategy_results.json
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const ENGINE_PATH = path.join(ROOT, 'utility/usedfull/Engines/consensusEngine.js');
const CANDLE_DIR = path.join(ROOT, 'candle_data');
const OUT_FILE = path.join(__dirname, 'best_real_strategy_results.json');

// ---------- load engine internals (without editing the engine file) ----------
const engineSrc = fs.readFileSync(ENGINE_PATH, 'utf8') +
    '\nmodule.exports.evaluateSingleStrategy = evaluateSingleStrategy;\nmodule.exports.__indicators = indicators;\n';
const engineMod = new Module(ENGINE_PATH, module);
engineMod.filename = ENGINE_PATH;
engineMod.paths = Module._nodeModulePaths(path.dirname(ENGINE_PATH));
engineMod._compile(engineSrc, ENGINE_PATH);
const { evaluateSingleStrategy, computeIndicators, __indicators: ind } = engineMod.exports;

// memoise the two heavy, strategy-independent price-action calls (identical results, just cached)
function memo(fn) {
    const cache = new Map();
    return (arr) => {
        const last = arr[arr.length - 1];
        const key = arr.length + '|' + (last && last.date) + '|' + (last && last.time);
        if (!cache.has(key)) cache.set(key, fn(arr));
        return cache.get(key);
    };
}
if (ind.priceAction) {
    if (typeof ind.priceAction.detectCandlestickPatterns === 'function')
        ind.priceAction.detectCandlestickPatterns = memo(ind.priceAction.detectCandlestickPatterns);
    if (typeof ind.priceAction.detectTrendlineBreakout === 'function')
        ind.priceAction.detectTrendlineBreakout = memo(ind.priceAction.detectTrendlineBreakout);
}

// ---------- load real candles ----------
function toSecs(t) {
    const s = String(t).trim().toLowerCase();
    const pm = s.includes('pm'), am = s.includes('am');
    const p = s.replace(/(am|pm)/g, '').trim().split(':');
    let h = parseInt(p[0] || '0', 10);
    const m = parseInt(p[1] || '0', 10);
    if (pm && h < 12) h += 12; else if (am && h === 12) h = 0;
    return h * 3600 + m * 60;
}
let candles = [];
for (const f of fs.readdirSync(CANDLE_DIR).filter(f => f.includes('_15m_') && f.endsWith('.json')).sort()) {
    try {
        const d = JSON.parse(fs.readFileSync(path.join(CANDLE_DIR, f), 'utf8'));
        if (Array.isArray(d)) candles = candles.concat(d);
    } catch (e) { /* skip */ }
}
const seen = new Set();
candles = candles.filter(c => { const k = c.date + c.time; if (seen.has(k)) return false; seen.add(k); return true; });
candles.sort((a, b) => (a.date + String(toSecs(a.time)).padStart(6, '0')).localeCompare(b.date + String(toSecs(b.time)).padStart(6, '0')));
candles.forEach((c, i) => { c.secs = toSecs(c.time); });
const days = [...new Set(candles.map(c => c.date))];
console.log(`Loaded ${candles.length} real 15m candles over ${days.length} trading days (${days[0]} -> ${days[days.length - 1]})`);

const computed = computeIndicators(candles, { interval: 15 });

// ---------- rule atoms: [buyRule, sellRule, isDirectional] ----------
const ATOMS = {
    ST:      [{ target: 'supertrend', condition: 'bullish' }, { target: 'supertrend', condition: 'bearish' }, true],
    VWAP:    [{ target: 'vwap', condition: 'above' }, { target: 'vwap', condition: 'below' }, true],
    RSI55:   [{ target: 'rsi', condition: 'gte', value: 55 }, { target: 'rsi', condition: 'lte', value: 45 }, true],
    RSI50:   [{ target: 'rsi', condition: 'gte', value: 50 }, { target: 'rsi', condition: 'lte', value: 50 }, true],
    EMA:     [{ target: 'ema', condition: 'goldenCross' }, { target: 'ema', condition: 'deathCross' }, true],
    TEMA:    [{ target: 'tripleEMA', condition: 'bullishStack' }, { target: 'tripleEMA', condition: 'bearishStack' }, true],
    MACD:    [{ target: 'macd', condition: 'bullishCross' }, { target: 'macd', condition: 'bearishCross' }, true],
    ORB:     [{ target: 'orb', condition: 'aboveHigh' }, { target: 'orb', condition: 'belowLow' }, true],
    DONCH:   [{ target: 'donchian', condition: 'upperBreak' }, { target: 'donchian', condition: 'lowerBreak' }, true],
    PDHL:    [{ target: 'prevDay', condition: 'abovePDH' }, { target: 'prevDay', condition: 'belowPDL' }, true],
    BB:      [{ target: 'bollinger', condition: 'upperBandBreak' }, { target: 'bollinger', condition: 'lowerBandBreak' }, true],
    MSTRUCT: [{ target: 'marketStructure', condition: 'swingHighBreak' }, { target: 'marketStructure', condition: 'swingLowBreak' }, true],
    CBRK:    [{ target: 'candleBreakout', condition: 'closeAbovePrevHigh' }, { target: 'candleBreakout', condition: 'closeBelowPrevLow' }, true],
    SWEEP:   [{ target: 'liquiditySweep', condition: 'bullishSweep' }, { target: 'liquiditySweep', condition: 'bearishSweep' }, true],
    WICK:    [{ target: 'priceAction', condition: 'lowerWickRejection' }, { target: 'priceAction', condition: 'upperWickRejection' }, true],
    SR:      [{ target: 'support', tolerance: 25 }, { target: 'resistance', tolerance: 25 }, true],
    TLINE:   [{ target: 'trendline', condition: 'bullishBreakout' }, { target: 'trendline', condition: 'bearishBreakout' }, true],
    CANDLE:  [{ target: 'candlestick', condition: 'bullish' }, { target: 'candlestick', condition: 'bearish' }, true],
    ADX20:   [{ target: 'adx', condition: 'gte', value: 20 }, { target: 'adx', condition: 'gte', value: 20 }, false],
    RVOL:    [{ target: 'rvol', condition: 'gte', value: 1.1 }, { target: 'rvol', condition: 'gte', value: 1.1 }, false]
};
const atomNames = Object.keys(ATOMS);

const combos = [];
(function gen(start, cur) {
    if (cur.length >= 1 && cur.some(n => ATOMS[n][2])) combos.push(cur.slice());
    if (cur.length === 3) return;
    for (let k = start; k < atomNames.length; k++) { cur.push(atomNames[k]); gen(k + 1, cur); cur.pop(); }
})(0, []);
console.log(`Rule combinations to test: ${combos.length}`);

// ---------- 1. signals per combo (independent of SL/TP) ----------
const WARMUP = 30; // ignore first candles (indicator warm-up)
function signalsFor(names) {
    const strat = {
        id: names.join('+'), name: names.join(' + '), enabled: true, indicators: { rvolMin: 1.1, adxMin: 20, srTolerance: 25 },
        rules: { buy: names.map(n => ATOMS[n][0]), sell: names.map(n => ATOMS[n][1]) }
    };
    const sig = new Array(candles.length).fill(0);
    for (let i = WARMUP; i < candles.length; i++) {
        const r = evaluateSingleStrategy(candles[i], i, candles, strat, computed, { slPoints: 10, targetPoints: 20 });
        if (r) sig[i] = r.type === 'BUY' ? 1 : -1;
    }
    return sig;
}

// ---------- 2. trade simulation ----------
const ENTRY_CUTOFF = 15 * 3600, EOD = 15 * 3600 + 15 * 60;
function simulate(sig, sl, tp, maxTrades, dayFrom, dayTo) {
    const trades = [];
    const perDay = {};
    let pos = null, lastExit = -1;
    for (let i = WARMUP; i < candles.length; i++) {
        const c = candles[i];
        if (c.date < dayFrom || c.date > dayTo) { pos = null; continue; }
        const hi = Number(c.high || c.candleHigh), lo = Number(c.low || c.candleLow), cl = Number(c.close || c.candleClose);
        const lastOfDay = c.secs >= EOD || i === candles.length - 1 || candles[i + 1].date !== c.date;
        if (pos) {
            const buy = pos.dir === 1;
            const slHit = buy ? lo <= pos.sl : hi >= pos.sl;
            const tpHit = buy ? hi >= pos.tp : lo <= pos.tp;
            let pts = null, why = null;
            if (slHit) { pts = -sl; why = 'SL'; }               // SL first when both inside one candle (conservative)
            else if (tpHit) { pts = tp; why = 'TP'; }
            else if (lastOfDay) { pts = buy ? cl - pos.entry : pos.entry - cl; why = 'EOD'; }
            if (why) { trades.push({ date: c.date, pts, why, dir: pos.dir }); pos = null; lastExit = i; }
        }
        if (!pos && sig[i] !== 0 && i > lastExit && !lastOfDay && c.secs <= ENTRY_CUTOFF && (perDay[c.date] || 0) < maxTrades) {
            perDay[c.date] = (perDay[c.date] || 0) + 1;
            pos = { dir: sig[i], entry: cl, sl: sig[i] === 1 ? cl - sl : cl + sl, tp: sig[i] === 1 ? cl + tp : cl - tp };
        }
    }
    return trades;
}
function stats(trades) {
    let w = 0, gw = 0, gl = 0;
    for (const t of trades) { if (t.pts > 0) { w++; gw += t.pts; } else gl += -t.pts; }
    const n = trades.length;
    // max drawdown
    let eq = 0, peak = 0, dd = 0;
    for (const t of trades) { eq += t.pts; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
    return { trades: n, winrate: n ? +(100 * w / n).toFixed(1) : 0, net: +(gw - gl).toFixed(1), pf: gl > 0 ? +(gw / gl).toFixed(2) : (gw > 0 ? 99 : 0), avg: n ? +((gw - gl) / n).toFixed(2) : 0, maxDD: +dd.toFixed(1) };
}

// ---------- 3. grid search with walk-forward ----------
const SLS = [10, 15, 20, 25, 30, 40];
const TPS = [15, 20, 30, 40, 60, 80];
const MAXT = [1, 2, 3];
const splitIdx = Math.floor(days.length * 0.6);
const trainFrom = days[0], trainTo = days[splitIdx - 1], testFrom = days[splitIdx], testTo = days[days.length - 1];
console.log(`TRAIN: ${trainFrom} -> ${trainTo} (${splitIdx} days) | TEST (unseen): ${testFrom} -> ${testTo} (${days.length - splitIdx} days)\n`);

const results = [];
const t0 = Date.now();
combos.forEach((names, ci) => {
    const sig = signalsFor(names);
    if (sig.filter(x => x !== 0).length < 20) return;       // too rare to judge
    for (const sl of SLS) for (const tp of TPS) for (const mt of MAXT) {
        const all = simulate(sig, sl, tp, mt, trainFrom, testTo);
        const tr = simulate(sig, sl, tp, mt, trainFrom, trainTo);
        const te = simulate(sig, sl, tp, mt, testFrom, testTo);
        results.push({ names, sl, tp, mt, all: stats(all), train: stats(tr), test: stats(te) });
    }
    if ((ci + 1) % 100 === 0) console.log(`  ... ${ci + 1}/${combos.length} combos (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
});
console.log(`\nEvaluated ${results.length} configurations in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

// ---------- 4. reporting ----------
const fmt = (r) => `${r.names.join('+').padEnd(28)} SL${String(r.sl).padStart(2)}/TP${String(r.tp).padStart(2)} max${r.mt}/d | ` +
    `TRAIN ${String(r.train.trades).padStart(3)}t WR${String(r.train.winrate).padStart(5)}% net${String(r.train.net).padStart(7)} PF${r.train.pf} | ` +
    `TEST ${String(r.test.trades).padStart(3)}t WR${String(r.test.winrate).padStart(5)}% net${String(r.test.net).padStart(7)} PF${r.test.pf} | ` +
    `ALL net${String(r.all.net).padStart(7)} PF${r.all.pf} DD${r.all.maxDD}`;

const MIN_TR = 12, MIN_TE = 6;
const eligible = results.filter(r => r.train.trades >= MIN_TR && r.test.trades >= MIN_TE);
const trainWinners = eligible.filter(r => r.train.net > 0 && r.train.pf >= 1.2);
const survived = trainWinners.filter(r => r.test.net > 0);
console.log(`\nEligible configs (enough trades both periods): ${eligible.length}`);
console.log(`Profitable on TRAIN (PF>=1.2): ${trainWinners.length}`);
console.log(`...of those, ALSO profitable on unseen TEST: ${survived.length} (${trainWinners.length ? (100 * survived.length / trainWinners.length).toFixed(1) : 0}%)  <- if ~50% => little real edge, mostly luck`);

const byTrain = trainWinners.slice().sort((a, b) => b.train.net - a.train.net).slice(0, 10);
console.log('\n=== TOP 10 by TRAIN score (and how they did on unseen TEST) ===');
byTrain.forEach(r => console.log(fmt(r)));

const robust = survived.filter(r => r.test.pf >= 1.2 && r.all.winrate >= 45)
    .map(r => ({ r, score: Math.min(r.train.net, r.test.net * (r.train.trades / Math.max(1, r.test.trades))) }))
    .sort((a, b) => b.score - a.score).slice(0, 15).map(x => x.r);
console.log('\n=== TOP 15 ROBUST (profitable + PF>=1.2 on BOTH train & unseen test) ===');
robust.forEach(r => console.log(fmt(r)));

// per-week stability of the #1 robust
function weekly(r) {
    const sig = signalsFor(r.names);
    const t = simulate(sig, r.sl, r.tp, r.mt, trainFrom, testTo);
    const wk = {};
    t.forEach(x => { const d = new Date(x.date); const jan1 = new Date(d.getFullYear(), 0, 1); const w = `${d.getFullYear()}-W${String(Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)).padStart(2, '0')}`; wk[w] = (wk[w] || 0) + x.pts; });
    return wk;
}
if (robust.length) {
    const wk = weekly(robust[0]);
    console.log(`\nWeekly P&L (pts) of #1 robust [${robust[0].names.join('+')}]:`);
    Object.entries(wk).forEach(([w, p]) => console.log(`  ${w}: ${p >= 0 ? '+' : ''}${p.toFixed(1)} ${p >= 0 ? 'GREEN' : 'RED'}`));
}

fs.writeFileSync(OUT_FILE, JSON.stringify({
    meta: { candles: candles.length, days: days.length, trainFrom, trainTo, testFrom, testTo, evaluated: results.length, trainWinners: trainWinners.length, survivedTest: survived.length },
    robust, topByTrain: byTrain,
    robustRules: robust.slice(0, 5).map(r => ({
        names: r.names, sl: r.sl, tp: r.tp, maxTradesPerDay: r.mt,
        rules: { buy: r.names.map(n => ATOMS[n][0]), sell: r.names.map(n => ATOMS[n][1]) }
    }))
}, null, 2));
console.log(`\nSaved -> ${OUT_FILE}`);
