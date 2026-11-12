// winrate_3m.mjs — signals computed on 3-MINUTE candles (resampled from Yahoo 1m), 15m trend context.
import { fetchCandles } from '../src/engine/data.js';
import { resample } from '../src/engine/live.js';
import { buildContext, scoreAt } from '../src/engine/signal.js';
const symbol = process.argv[2] || 'SPX500', COST = Number(process.env.COST || 0.15);
const f = await fetchCandles(symbol, '1m', '7d');
const c3 = resample(f.candles, 180000, Date.now() + 1e9), c15 = resample(f.candles, 900000, Date.now() + 1e9);
const x3 = buildContext(c3), x15 = buildContext(c15);
const s15 = c15.map((_, k) => scoreAt(x15, k, {}));
console.log(`${symbol}: ${c3.length} 3m bars, ${c15.length} 15m bars · cost ${COST}R\n`);
function run(rr, atrMult, hold, gate, minAbs) {
  let k15 = 0, rs = [], i = 55;
  while (i < c3.length - hold - 1) {
    const b = c3[i], fs = scoreAt(x3, i, { rr, atrMult }); i++;
    if (!fs.ok) continue;
    while (k15 + 1 < c15.length && c15[k15 + 1].t + 900000 <= b.t + 180000) k15++;   // only CLOSED 15m bars
    const slow = s15[k15]; if (!slow?.ok) continue;
    const dir = Math.sign(fs.score); if (!dir || Math.abs(fs.score) < minAbs) continue;
    if (gate && Math.sign(slow.score) !== dir) continue;
    const risk = atrMult * fs.atr, buy = dir > 0;
    const stop = buy ? b.c - risk : b.c + risk, target = buy ? b.c + risk * rr : b.c - risk * rr;
    let r = null, j = i;
    for (; j < i + hold; j++) { const k = c3[j]; if (buy ? k.l <= stop : k.h >= stop) { r = -1; break; } if (buy ? k.h >= target : k.l <= target) { r = rr; break; } }
    if (r === null) { const e = c3[j - 1].c; r = (buy ? e - b.c : b.c - e) / risk; }
    rs.push(r - COST); i = j + 1;
  }
  const w = rs.filter(x => x > 0).length, n = rs.length || 1;
  return { n: rs.length, win: Math.round(100 * w / n), net: +rs.reduce((a, b) => a + b, 0).toFixed(1), per: +(rs.reduce((a, b) => a + b, 0) / n).toFixed(3) };
}
console.log('rr  atr  hold(3m bars)  15m-gate  min|score|   trades  win%  netR  R/trade');
for (const [rr, am] of [[2, 1.5], [1.5, 1.5], [1, 1.5]])
 for (const hold of [1, 2, 3])
  for (const gate of [false, true])
   for (const minAbs of [0, 40]) {
    const r = run(rr, am, hold, gate, minAbs);
    console.log(`${rr}   ${am}   ${hold}              ${gate ? 'yes' : 'no '}      ${String(minAbs).padEnd(10)} ${String(r.n).padEnd(7)} ${String(r.win).padEnd(5)} ${String(r.net).padEnd(5)} ${r.per}`);
  }
