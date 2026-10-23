// Null baseline: random-direction entries on the SAME real candles with same SL/TP/rules -> what does "pure luck" earn?
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../candle_data');
const secs = t => { const s = String(t).toLowerCase(); const p = s.replace(/(am|pm)/g, '').trim().split(':'); let h = +p[0]; if (s.includes('pm') && h < 12) h += 12; if (s.includes('am') && h === 12) h = 0; return h * 3600 + (+p[1]) * 60; };
let c = [];
for (const f of fs.readdirSync(dir).filter(f => f.includes('_15m_')).sort()) { try { const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (Array.isArray(d)) c = c.concat(d); } catch (e) {} }
c.forEach(x => x.s = secs(x.time));
c.sort((a, b) => (a.date + String(a.s).padStart(6, '0')).localeCompare(b.date + String(b.s).padStart(6, '0')));

function run(sl, tp, mt, pEntry, rnd) {
    let net = 0, gw = 0, gl = 0, n = 0, pos = null, last = -1, cnt = {};
    for (let i = 30; i < c.length; i++) {
        const x = c[i], hi = +x.high, lo = +x.low, cl = +x.close;
        const eod = x.s >= 54900 || i === c.length - 1 || c[i + 1].date !== x.date;
        if (pos) {
            const b = pos.d === 1;
            const slH = b ? lo <= pos.sl : hi >= pos.sl, tpH = b ? hi >= pos.tp : lo <= pos.tp;
            let p = null;
            if (slH) p = -sl; else if (tpH) p = tp; else if (eod) p = b ? cl - pos.e : pos.e - cl;
            if (p !== null) { n++; net += p; if (p > 0) gw += p; else gl -= p; pos = null; last = i; }
        }
        if (!pos && i > last && !eod && x.s <= 54000 && (cnt[x.date] || 0) < mt && rnd() < pEntry) {
            cnt[x.date] = (cnt[x.date] || 0) + 1;
            const d = rnd() < 0.5 ? 1 : -1;
            pos = { d, e: cl, sl: d === 1 ? cl - sl : cl + sl, tp: d === 1 ? cl + tp : cl - tp };
        }
    }
    return { n, net, pf: gl > 0 ? gw / gl : 99 };
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

for (const [sl, tp] of [[30, 60], [40, 80], [25, 80], [30, 80]]) {
    const R = []; for (let s = 1; s <= 2000; s++) R.push(run(sl, tp, 3, 0.10, mulberry(s)));
    R.sort((a, b) => a.net - b.net);
    const q = p => R[Math.floor(p * (R.length - 1))];
    console.log(`SL${sl}/TP${tp} RANDOM direction (2000 runs, ~${Math.round(R.reduce((a, b) => a + b.n, 0) / R.length)} trades): net median ${q(.5).net.toFixed(0)} | p5 ${q(.05).net.toFixed(0)} | p95 ${q(.95).net.toFixed(0)} | p99 ${q(.99).net.toFixed(0)} | median PF ${q(.5).pf.toFixed(2)} | p95 PF ${[...R].sort((a, b) => a.pf - b.pf)[Math.floor(.95 * 1999)].pf.toFixed(2)}`);
}
