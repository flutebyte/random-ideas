// selective_3m.mjs — win rate when we only trade filtered setups (3m candles, NY-open window).
import { fetchCandles } from '../src/engine/data.js';
import { resample } from '../src/engine/live.js';
import { buildContext, scoreAt } from '../src/engine/signal.js';
const symbol = process.argv[2] || 'SPX500', COST = Number(process.env.COST_PTS || 0.6);
const f = await fetchCandles(symbol, '1m', '7d');
const c = resample(f.candles, 180000, Date.now() + 1e9), c15 = resample(f.candles, 900000, Date.now() + 1e9);
const x = buildContext(c), x15 = buildContext(c15), s15 = c15.map((_, k) => scoreAt(x15, k, {}));
const OPEN = 14 * 60 + 30, um = t => new Date(t).getUTCHours() * 60 + new Date(t).getUTCMinutes();
function run(win, gate, minAbs, brk, rr, hold) {
  let k15 = 0, i = 55, rs = [];
  while (i < c.length - hold - 1) {
    const b = c[i], m = um(b.t); i++;
    while (k15 + 1 < c15.length && c15[k15 + 1].t + 900000 <= b.t + 180000) k15++;
    if (win && !(m >= OPEN && m < OPEN + 150)) continue;
    const s = scoreAt(x, i - 1, {}); if (!s.ok || !s.atr) continue;
    const dir = Math.sign(s.score); if (!dir || Math.abs(s.score) < minAbs) continue;
    if (gate && Math.sign(s15[k15]?.score) !== dir) continue;
    if (brk) { const hi = Math.max(...c.slice(i - 11, i - 1).map(z => z.h)), lo = Math.min(...c.slice(i - 11, i - 1).map(z => z.l)); if (!(dir > 0 ? b.c > hi : b.c < lo)) continue; }
    const buy = dir > 0, r = 1.5 * s.atr, e = b.c, stop = buy ? e - r : e + r, tg = buy ? e + rr * r : e - rr * r;
    let out = null, j = i;
    for (; j < i + hold; j++) { const k = c[j]; if (buy ? k.l <= stop : k.h >= stop) { out = -r; break; } if (buy ? k.h >= tg : k.l <= tg) { out = rr * r; break; } }
    if (out === null) { const l = c[j - 1].c; out = buy ? l - e : e - l; }
    rs.push((out - COST) / r); i = j + 1;
  }
  const w = rs.filter(v => v > 0).length, n = rs.length;
  return { n, win: n ? Math.round(100 * w / n) : 0, R: +rs.reduce((a, v) => a + v, 0).toFixed(1) };
}
console.log(`${symbol} · spread ${COST} pts\nfilter                                        trades win%  netR`);
for (const [name, win, gate, minAbs, brk] of [
  ['all day, no filter', false, false, 0, false],
  ['NY open only', true, false, 0, false],
  ['NY open + 15m trend agrees', true, true, 0, false],
  ['NY open + 15m agrees + strong(>=40)', true, true, 40, false],
  ['NY open + breakout of 30-min range', true, false, 0, true],
  ['NY open + breakout + 15m agrees', true, true, 0, true]])
  for (const [rr, hold] of [[1, 3], [2, 3]]) { const r = run(win, gate, minAbs, brk, rr, hold); console.log(`${(name + ' · rr' + rr).padEnd(45)} ${String(r.n).padEnd(6)} ${String(r.win).padEnd(5)} ${r.R}`); }
