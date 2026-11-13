// Compare several published intraday SPX ideas on ~60 days of 5m candles (Yahoo ES=F), after a 0.6-pt spread.
import { fetchCandles } from '../src/engine/data.js';
const sym = process.argv[2] || 'SPX500', COST = Number(process.env.COST_PTS || 0.6);
const f = await fetchCandles(sym, '5m', '60d'); const c = f.candles;
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
const ny = t => { const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value])); return { d: `${p.year}-${p.month}-${p.day}`, m: (p.hour % 24) * 60 + Number(p.minute) }; };
const days = {}; for (const b of c) { const n = ny(b.t); if (n.m >= 570 && n.m < 960) (days[n.d] ||= []).push({ ...b, m: n.m }); }
const D = Object.values(days).filter(x => x.length >= 70);
console.log(`${sym}: ${c.length} 5m bars · ${D.length} full sessions · cost ${COST} pts\n`);
const res = {}; const add = (k, pts, risk) => { const r = (res[k] ||= { n: 0, w: 0, pts: 0, R: 0 }); r.n++; if (pts - COST > 0) r.w++; r.pts += pts - COST; r.R += risk ? (pts - COST) / risk : 0; };
function walk(bars, i, buy, stop, tgt) {                      // enter at close of bars[i]; returns pts
  const e = bars[i].c; for (let j = i + 1; j < bars.length; j++) { const q = bars[j];
    if (buy ? q.l <= stop : q.h >= stop) return buy ? stop - e : e - stop; if (tgt != null && (buy ? q.h >= tgt : q.l <= tgt)) return buy ? tgt - e : e - tgt; }
  const l = bars[bars.length - 1].c; return buy ? l - e : e - l; }
for (const bars of D) {
  for (const N of [1, 3, 6]) {                                  // opening range = N x 5m bars (5/15/30 min)
    const or = bars.slice(0, N), hi = Math.max(...or.map(b => b.h)), lo = Math.min(...or.map(b => b.l)), mid = (hi + lo) / 2;
    let seen = false, fadeState = 0, fext = 0, fdone = false;
    for (let i = N; i < bars.length - 1 && bars[i].m <= 690; i++) {
      const b = bars[i];
      if (!seen && (b.c > hi || b.c < lo)) { seen = true; const buy = b.c > hi;
        for (const rr of [1, 2]) { const stop = buy ? lo : hi, r = Math.abs(b.c - stop); if (r < 1) continue; add(`ORB ${N * 5}m · stop other side · ${rr}R`, walk(bars, i, buy, stop, buy ? b.c + rr * r : b.c - rr * r), r); }
        const sm = mid, rm = Math.abs(b.c - sm); if (rm >= 1) add(`ORB ${N * 5}m · stop midpoint · 2R`, walk(bars, i, buy, sm, buy ? b.c + 2 * rm : b.c - 2 * rm), rm);
        if (seen) break; }
    }
    for (let i = N; i < bars.length - 1 && !fdone; i++) { const b = bars[i];                 // failed-breakout fade
      if (!fadeState) { if (b.c > hi) { fadeState = 1; fext = b.h; } else if (b.c < lo) { fadeState = -1; fext = b.l; } }
      else { fext = fadeState > 0 ? Math.max(fext, b.h) : Math.min(fext, b.l);
        if (b.c <= hi && b.c >= lo) { const buy = fadeState < 0, r = Math.abs(b.c - fext); if (r >= 1) add(`FADE failed ${N * 5}m-range break · 2R`, walk(bars, i, buy, fext, buy ? b.c + 2 * r : b.c - 2 * r), r); fdone = true; } } }
  }
  // first-30-min momentum -> hold last 30 min (Gao et al. 2018)
  const o = bars[0].o, c30 = bars[5].c, side = Math.sign(c30 - o), lastIdx = bars.findIndex(b => b.m >= 930);
  if (side && lastIdx > 0) { const e = bars[lastIdx].o, x = bars[bars.length - 1].c; add('first-30m direction -> hold last 30m', side > 0 ? x - e : e - x, 5); }
  // trend-day pullback through session mean
  const bias = Math.sign(bars[5].c - bars[0].o); let sum = 0, done = false;
  for (let i = 0; i < bars.length - 1; i++) { sum += (bars[i].h + bars[i].l + bars[i].c) / 3; const mean = sum / (i + 1);
    if (i >= 8 && !done && bias && bars[i].m <= 690) { const p = bars[i - 1], b = bars[i], buy = bias > 0;
      if (buy ? p.c < mean && b.c > mean : p.c > mean && b.c < mean) { const win = bars.slice(i - 5, i + 1), stop = buy ? Math.min(...win.map(x => x.l)) : Math.max(...win.map(x => x.h)), r = Math.abs(b.c - stop);
        if (r >= 1) { add('pullback through session mean in 30m-bias direction · 1.5R', walk(bars, i, buy, stop, buy ? b.c + 1.5 * r : b.c - 1.5 * r), r); done = true; } } } }
}
console.log('strategy'.padEnd(58), 'trades win%  net pts   avg R');
for (const [k, r] of Object.entries(res).sort()) console.log(k.padEnd(58), String(r.n).padEnd(6), (Math.round(100 * r.w / r.n) + '%').padEnd(5), r.pts.toFixed(0).padStart(7), (r.R / r.n).toFixed(2).padStart(7));
