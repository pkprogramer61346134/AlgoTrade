/**
 * Backtest the candidate strategy THROUGH server/backtesting/backtesting.js
 *  A) engine exactly as-is (includes the random BUY/SELL coin-flip at lines 267-268) x N runs
 *  B) in-memory copy of the engine with ONLY the coin-flip removed (file on disk untouched)
 * master_strategy.json + backtest_report.json are backed up and ALWAYS restored.
 *
 * OFFLINE: utility/usedfull/cached-historical-data.js is replaced (in require.cache only) by a
 * local-files-only reader of C:\AlgoTrade\candle_data, so NO Dhan API call / token refresh can happen.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const MASTER = path.join(ROOT, 'utility/usedfull/Engines/strategies/master_strategy.json');
const CANDIDATE = path.join(__dirname, 'best_strategy_candidate.json');
const REPORT = path.join(ROOT, 'server/backtesting/backtest_report.json');
const ENGINE = path.join(ROOT, 'server/backtesting/backtesting.js');

const FROM = process.argv[2] || '2026-08-24';
const TO = process.argv[3] || '2026-10-21';
const RUNS = Number(process.argv[4] || 10);
const PARAMS = { fromDate: FROM, toDate: TO, interval: '15', slPoints: 30, targetPoints: 60, maxTradesPerDay: 3 };

// ---------- offline cache stub ----------
const CACHE_MOD = path.join(ROOT, 'utility/usedfull/cached-historical-data.js');
const CANDLE_DIR = path.join(ROOT, 'candle_data');
const tsecs = (t) => { const s = String(t || '').trim().toLowerCase(); const p = s.replace(/(am|pm)/g, '').trim().split(':'); let h = parseInt(p[0] || '0', 10); if (s.includes('pm') && h < 12) h += 12; else if (s.includes('am') && h === 12) h = 0; return h * 3600 + parseInt(p[1] || '0', 10) * 60 + parseInt(p[2] || '0', 10); };
function localDay(interval, date) {
    const f = path.join(CANDLE_DIR, `candles_13_IDX_I_${interval}m_${date}_to_${date}.json`);
    if (!fs.existsSync(f)) return [];
    try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(d) ? d.map(c => ({ ...c, open: +(c.open ?? c.candleOpen), high: +(c.high ?? c.candleHigh), low: +(c.low ?? c.candleLow), close: +(c.close ?? c.candleClose), volume: +(c.volume ?? c.candleVolume ?? 0) })) : []; } catch (e) { return []; }
}
const allDates = (interval) => fs.readdirSync(CANDLE_DIR).filter(f => f.includes(`_${interval}m_`) && f.endsWith('.json')).map(f => f.match(/_(\d{4}-\d{2}-\d{2})_to_/)[1]).sort();
const dayCache = {};
const getDay = (iv, d) => (dayCache[iv + d] = dayCache[iv + d] || localDay(iv, d));
async function offlineGetCachedCandles(p = {}) {
    const iv = String(p.interval || '15');
    const dates = allDates(iv);
    const count = Number(p.count || p.candleCount || p.limit || 0);
    let out = [];
    if (count > 0) {
        const upTo = p.date || p.toDate || p.fromDate;
        const cutSecs = p.time ? tsecs(p.time) : null;
        for (const d of dates) {
            if (upTo && d > upTo) continue;
            let day = getDay(iv, d);
            if (d === upTo && cutSecs !== null) day = day.filter(c => tsecs(c.time) <= cutSecs);
            out = out.concat(day);
        }
        out = out.slice(-count);
    } else {
        for (const d of dates) { if (d >= p.fromDate && d <= (p.toDate || p.fromDate)) out = out.concat(getDay(iv, d)); }
    }
    out = out.map((c, i) => ({ ...c, index: i + 1 }));
    return { status: 'success', source: 'LOCAL_ONLY', totalCandles: out.length, data: out };
}
require.cache[CACHE_MOD] = { id: CACHE_MOD, filename: CACHE_MOD, loaded: true, exports: { getCachedCandles: offlineGetCachedCandles, getCandlesBeforeDateTime: offlineGetCachedCandles, getCandlesBefore: offlineGetCachedCandles }, children: [], paths: [] };

// ---------- backups ----------
const masterBackup = fs.readFileSync(MASTER);
fs.writeFileSync(path.join(__dirname, 'master_strategy.ORIGINAL_BACKUP.json'), masterBackup);
const reportBackup = fs.existsSync(REPORT) ? fs.readFileSync(REPORT) : null;
const realLog = console.log;
const quiet = () => { console.log = () => {}; };
const loud = () => { console.log = realLog; };

function restore() {
    fs.writeFileSync(MASTER, masterBackup);
    if (reportBackup) fs.writeFileSync(REPORT, reportBackup);
}
process.on('exit', restore);
process.on('SIGINT', () => process.exit(1));

function loadNoCoinFlipEngine() {
    let src = fs.readFileSync(ENGINE, 'utf8');
    const before = src;
    src = src.replace(/const isHeads = Math\.random\(\) < 0\.5;\s*consensusResult\.consensus = isHeads \? "BUY" : "SELL";/,
        '/* coin-flip removed for comparison */');
    if (src === before) throw new Error('coin-flip pattern not found - engine changed?');
    const m = new Module(ENGINE, module);
    m.filename = ENGINE;
    m.paths = Module._nodeModulePaths(path.dirname(ENGINE));
    m._compile(src, ENGINE);
    return m.exports;
}

const row = (tag, s) => `${tag.padEnd(22)} trades ${String(s.totalTrades).padStart(3)} | W ${String(s.winningTrades).padStart(3)} L ${String(s.losingTrades).padStart(3)} | WR ${String(s.winrate).padStart(6)} | TP ${String(s.trHits).padStart(3)} SL ${String(s.slHits).padStart(3)} EOD ${String(s.eodExits).padStart(2)} | Net ${String(s.netPoints).padStart(8)} | PF ${s.profitFactor}`;

(async () => {
    fs.writeFileSync(MASTER, fs.readFileSync(CANDIDATE));
    realLog(`Candidate strategy loaded temporarily. Range ${FROM} -> ${TO} | SL ${PARAMS.slPoints} / TP ${PARAMS.targetPoints} | max ${PARAMS.maxTradesPerDay}/day\n`);

    // ---- B) no coin-flip (deterministic) ----
    quiet();
    const fixed = loadNoCoinFlipEngine();
    const repB = await fixed.runBacktest({ ...PARAMS });
    loud();
    realLog('=== B) backtesting.js with coin-flip REMOVED (true strategy direction) ===');
    realLog(row('deterministic', repB.stats));
    const monthly = {};
    repB.trades.forEach(t => { const k = t.exitDate.slice(0, 7); monthly[k] = (monthly[k] || 0) + t.points; });
    realLog('Monthly:', Object.entries(monthly).map(([k, v]) => `${k}: ${v >= 0 ? '+' : ''}${v.toFixed(1)}`).join(' | '));
    const wk = {};
    repB.trades.forEach(t => { const d = new Date(t.exitDate); const j = new Date(d.getFullYear(), 0, 1); const w = 'W' + String(Math.ceil(((d - j) / 86400000 + j.getDay() + 1) / 7)).padStart(2, '0'); wk[w] = (wk[w] || 0) + t.points; });
    realLog('Weekly :', Object.entries(wk).map(([k, v]) => `${k}: ${v >= 0 ? '+' : ''}${v.toFixed(0)}`).join(' | '));

    // ---- A) engine as-is, coin-flip active, multiple runs ----
    const asIs = require(ENGINE);
    const nets = [], wrs = [];
    realLog(`\n=== A) backtesting.js EXACTLY AS-IS (random BUY/SELL coin-flip active) x ${RUNS} runs ===`);
    for (let r = 1; r <= RUNS; r++) {
        quiet();
        const rep = await asIs.runBacktest({ ...PARAMS });
        loud();
        nets.push(rep.stats.netPoints); wrs.push(parseFloat(rep.stats.winrate));
        realLog(row(`run ${r}`, rep.stats));
    }
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    realLog(`\nAs-is engine average over ${RUNS} runs: Net ${avg(nets).toFixed(1)} pts | WR ${avg(wrs).toFixed(1)}% | best ${Math.max(...nets)} | worst ${Math.min(...nets)}`);
    restore();
    realLog('\nRestored master_strategy.json and backtest_report.json to original state.');
})().catch(e => { loud(); console.error('FAILED:', e); process.exitCode = 1; });
