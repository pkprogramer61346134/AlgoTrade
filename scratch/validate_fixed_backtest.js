/**
 * Validate the FIXED backtesting.js + installed master_strategy.json, fully OFFLINE
 * (cached-historical-data is replaced in require.cache by a local-files-only reader -> no Dhan API / token refresh).
 * Usage: node scratch/validate_fixed_backtest.js
 * Does not modify master_strategy.json; backtest_report.json is backed up and restored.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CACHE_MOD = path.join(ROOT, 'utility/usedfull/cached-historical-data.js');
const CANDLE_DIR = path.join(ROOT, 'candle_data');
const REPORT = path.join(ROOT, 'server/backtesting/backtest_report.json');

const tsecs = (t) => { const s = String(t || '').trim().toLowerCase(); const p = s.replace(/(am|pm)/g, '').trim().split(':'); let h = parseInt(p[0] || '0', 10); if (s.includes('pm') && h < 12) h += 12; else if (s.includes('am') && h === 12) h = 0; return h * 3600 + parseInt(p[1] || '0', 10) * 60 + parseInt(p[2] || '0', 10); };
const dayCache = {};
function getDay(iv, d) {
    const k = iv + d; if (dayCache[k]) return dayCache[k];
    const f = path.join(CANDLE_DIR, `candles_13_IDX_I_${iv}m_${d}_to_${d}.json`);
    let out = [];
    if (fs.existsSync(f)) { try { const a = JSON.parse(fs.readFileSync(f, 'utf8')); if (Array.isArray(a)) out = a.map(c => ({ ...c, open: +(c.open ?? c.candleOpen), high: +(c.high ?? c.candleHigh), low: +(c.low ?? c.candleLow), close: +(c.close ?? c.candleClose), volume: +(c.volume ?? c.candleVolume ?? 0) })); } catch (e) {} }
    return (dayCache[k] = out);
}
const datesOf = (iv) => fs.readdirSync(CANDLE_DIR).filter(f => f.includes(`_${iv}m_`) && f.endsWith('.json')).map(f => f.match(/_(\d{4}-\d{2}-\d{2})_to_/)[1]).sort();
async function offline(p = {}) {
    const iv = String(p.interval || '15'), dates = datesOf(iv), count = Number(p.count || p.candleCount || p.limit || 0);
    let out = [];
    if (count > 0) {
        const upTo = p.date || p.toDate || p.fromDate, cut = p.time ? tsecs(p.time) : null;
        for (const d of dates) { if (upTo && d > upTo) continue; let day = getDay(iv, d); if (d === upTo && cut !== null) day = day.filter(c => tsecs(c.time) <= cut); out = out.concat(day); }
        out = out.slice(-count);
    } else {
        for (const d of dates) if (d >= p.fromDate && d <= (p.toDate || p.fromDate)) out = out.concat(getDay(iv, d));
    }
    return { status: 'success', source: 'LOCAL_ONLY', totalCandles: out.length, data: out.map((c, i) => ({ ...c, index: i + 1 })) };
}
require.cache[CACHE_MOD] = { id: CACHE_MOD, filename: CACHE_MOD, loaded: true, exports: { getCachedCandles: offline, getCandlesBeforeDateTime: offline, getCandlesBefore: offline }, children: [], paths: [] };

const reportBackup = fs.existsSync(REPORT) ? fs.readFileSync(REPORT) : null;
process.on('exit', () => { if (reportBackup) fs.writeFileSync(REPORT, reportBackup); });
const realLog = console.log;
const engine = require(path.join(ROOT, 'server/backtesting/backtesting.js'));

const row = (tag, s) => `${tag.padEnd(34)} trades ${String(s.totalTrades).padStart(3)} | W ${String(s.winningTrades).padStart(3)} L ${String(s.losingTrades).padStart(3)} | WR ${String(s.winrate).padStart(6)} | TP ${String(s.trHits).padStart(3)} SL ${String(s.slHits).padStart(3)} EOD ${String(s.eodExits).padStart(2)} | Net ${String(s.netPoints).padStart(8)} | PF ${s.profitFactor}`;
async function run(tag, from, to, extra = {}) {
    console.log = () => {};
    let rep;
    try { rep = await engine.runBacktest({ fromDate: from, toDate: to, interval: '15', slPoints: 30, targetPoints: 60, maxTradesPerDay: 3, ...extra }); }
    finally { console.log = realLog; }
    realLog(row(tag, rep.stats));
    return rep;
}

(async () => {
    realLog('Fixed backtesting.js (no coin-flip, SL-first on ambiguous candles) + installed master_strategy.json\n');
    // 08-14..08-21 was downloaded AFTER the strategy search -> genuinely unseen data
    await run('UNSEEN 14-21 Aug (never searched)', '2026-08-14', '2026-08-21');
    await run('TRAIN-ish 24 Aug - 25 Sep', '2026-08-24', '2026-09-25');
    await run('TEST-ish 28 Sep - 21 Oct', '2026-09-28', '2026-10-21');
    const full = await run('FULL 24 Aug - 21 Oct', '2026-08-24', '2026-10-21');
    // repeatability: identical result expected now that randomness is gone
    await run('FULL again (must be identical)', '2026-08-24', '2026-10-21');
    // parameter-neighbour check (is it a plateau or a lucky spike?)
    realLog('\nSensitivity (neighbouring SL/TP, full range):');
    for (const [sl, tp] of [[25, 50], [25, 60], [30, 45], [30, 80], [35, 70], [40, 80], [20, 40]]) await run(`  SL${sl}/TP${tp}`, '2026-08-24', '2026-10-21', { slPoints: sl, targetPoints: tp });
    // with trailing jump
    realLog('\nWith trailing jump (full range, SL30/TP60):');
    for (const tj of [15, 20, 30]) await run(`  trailingJump ${tj}`, '2026-08-24', '2026-10-21', { trailingJumpPoints: tj });
    const m = {}; full.trades.forEach(t => { const k = t.exitDate.slice(0, 7); m[k] = (m[k] || 0) + t.points; });
    realLog('\nMonthly (full):', Object.entries(m).map(([k, v]) => `${k}: ${v >= 0 ? '+' : ''}${v.toFixed(1)}`).join(' | '));
})().catch(e => { console.log = realLog; console.error('FAILED:', e); process.exitCode = 1; });
