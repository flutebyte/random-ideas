// session_ideas_3m.mjs — tests "trade only the NY open" and "range breakout" ideas on 3m candles.
// Yahoo gives only 7 days of 1m data (~5 sessions) → tiny sample, indicative only.
import { fetchCandles } from '../src/engine/data.js';
import { resample } from '../src/engine/live.js';
import { buildContext, scoreAt } from '../src/engine/signal.js';
const symbol = process.argv[2] || 'SPX500', COST = Number(process.env.COST_PTS || 0.6);   // round-trip spread in POINTS
const f = await fetchCandles(symbol, '1m', '7d');
const c = resample(f.candles, 180000, Date.now() + 1e9), x = buildContext(c);
const utcMin = t => { const d = new Date(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const OPEN = 14 * 60 + 30;                                   // NY cash open, Nov = 14:30 UTC
const day = t => new Date(t).toISOString().slice(0, 10);
console.log(`${symbol}: ${c.length} 3m bars over ${new Set(c.map(b => day(b.t))).size} days · spread ${COST} pts per trade\n`);

function atrAt(i) { const a = x.atr14[i]; return a || null; }
function sim(i, buy, stop, target, hold) {                    // enter at close of bar i, walk forward
  const e = c[i].c; let j = i + 1;
  for (; j <= i + hold && j < c.length; j++) {
    const k = c[j];
    if (buy ? k.l <= stop : k.h >= stop) return { pts: (buy ? stop - e : e - stop) - COST, end: j, risk: Math.abs(e - stop) };
    if (buy ? k.h >= target : k.l <= target) return { pts: (buy ? target - e : e - target) - COST, end: j, risk: Math.abs(e - stop) };
  }
  const last = c[Math.min(j - 1, c.length - 1)].c;
  return { pts: (buy ? last - e : e - last) - COST, end: j - 1, risk: Math.abs(e - stop) };
}
function report(name, trs) {
  const n = trs.length; if (!n) { console.log(name.padEnd(46), 'no trades'); return; }
  const w = trs.filter(t => t.pts > 0).length, net = trs.reduce((a, t) => a + t.pts, 0), R = trs.reduce((a, t) => a + t.pts / t.risk, 0);
  console.log(name.padEnd(46), String(n).padEnd(6), (Math.round(100 * w / n) + '%').padEnd(6), (net.toFixed(1) + ' pts').padEnd(11), R.toFixed(1) + 'R');
}
console.log('idea'.padEnd(46), 'trades win%   net          net R');

// ---- 1) engine lean, NY-open hour only -------------------------------------
for (const [label, from, to] of [['first hour (14:30-15:30 UTC)', OPEN, OPEN + 60], ['first 2h', OPEN, OPEN + 120], ['outside first 2h', -1, -2]]) {
  for (const rr of [1, 2]) {
    const trs = []; let i = 55;
    while (i < c.length - 5) {
      const m = utcMin(c[i].t), inW = from === -1 ? !(m >= OPEN && m < OPEN + 120) : (m >= from && m < to);
      const s = scoreAt(x, i, {}); const a = atrAt(i);
      if (inW && s.ok && Math.sign(s.score) && a) {
        const buy = s.score > 0, r = 1.5 * a, e = c[i].c;
        const t = sim(i, buy, buy ? e - r : e + r, buy ? e + rr * r : e - rr * r, 3); trs.push(t); i = t.end + 1;
      } else i++;
    }
    report(`engine lean · ${label} · rr${rr}`, trs);
  }
}

// ---- 2) previous-N-bar range breakout (any time / NY hours only) -------------
for (const N of [10, 20]) for (const nyOnly of [false, true]) for (const rr of [1, 2]) {
  const trs = []; let i = N + 1;
  while (i < c.length - 5) {
    const m = utcMin(c[i].t), ok = !nyOnly || (m >= OPEN && m < OPEN + 150), a = atrAt(i);
    if (!ok || !a) { i++; continue; }
    const hi = Math.max(...c.slice(i - N, i).map(b => b.h)), lo = Math.min(...c.slice(i - N, i).map(b => b.l)), cl = c[i].c;
    if (cl > hi || cl < lo) {
      const buy = cl > hi, r = 1.5 * a, t = sim(i, buy, buy ? cl - r : cl + r, buy ? cl + rr * r : cl - rr * r, 3); trs.push(t); i = t.end + 1;
    } else i++;
  }
  report(`${N * 3}-min range breakout · ${nyOnly ? 'NY hours' : 'all day'} · rr${rr}`, trs);
}

// ---- 3) opening-range breakout: first 30 min range, trade first close outside it --------
for (const rr of [1, 2]) for (const hold of [10, 30]) {
  const trs = []; const days = [...new Set(c.map(b => day(b.t)))];
  for (const d of days) {
    const idx = c.map((b, k) => k).filter(k => day(c[k].t) === d);
    const orIdx = idx.filter(k => utcMin(c[k].t) >= OPEN && utcMin(c[k].t) < OPEN + 30);
    if (orIdx.length < 8) continue;
    const hi = Math.max(...orIdx.map(k => c[k].h)), lo = Math.min(...orIdx.map(k => c[k].l));
    const after = idx.filter(k => utcMin(c[k].t) >= OPEN + 30 && utcMin(c[k].t) < OPEN + 150);
    for (const k of after) {
      const cl = c[k].c;
      if (cl > hi || cl < lo) { const buy = cl > hi, r = Math.abs(cl - (buy ? lo : hi)) ; if (r > 0) trs.push(sim(k, buy, buy ? lo : hi, buy ? cl + rr * r : cl - rr * r, hold)); break; }
    }
  }
  report(`opening-range breakout · rr${rr} · hold ${hold * 3} min`, trs);
}

// ---- per-day check of "engine lean · first 2h · rr1" -----------------------
{
  const byDay = {}; let i = 55;
  while (i < c.length - 5) {
    const m = utcMin(c[i].t), s = scoreAt(x, i, {}), a = atrAt(i);
    if (m >= OPEN && m < OPEN + 120 && s.ok && Math.sign(s.score) && a) {
      const buy = s.score > 0, r = 1.5 * a, e = c[i].c, t = sim(i, buy, buy ? e - r : e + r, buy ? e + r : e - r, 3);
      (byDay[day(c[i].t)] ||= []).push(t.pts / t.risk); i = t.end + 1;
    } else i++;
  }
  console.log('\nper-day net R, engine lean · first 2h · rr1:');
  for (const [d, v] of Object.entries(byDay)) console.log('  ' + d, String(v.length).padEnd(3) + ' trades', v.reduce((a, b) => a + b, 0).toFixed(1) + 'R');
}
