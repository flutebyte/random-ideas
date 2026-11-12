// winrate_experiment.mjs — shows what "high win rate" settings do to profit.
// Same engine + 1m SPX500 data as scalp_backtest; always trades the engine's lean.
import { fetchCandles } from '../src/engine/data.js';
import { buildContext, scoreAt, combineTimeframes } from '../src/engine/signal.js';
const symbol = process.argv[2] || 'SPX500', COST = Number(process.env.COST || 0.15);
const f = await fetchCandles(symbol, '1m', '7d'), s = await fetchCandles(symbol, '5m', '30d');
const cf = buildContext(f.candles), cs = buildContext(s.candles);
const ss = s.candles.map((_, k) => scoreAt(cs, k, {}));
function run(rr, atrMult, hold) {
  let sk = 0, rs = [], i = 55;
  while (i < f.candles.length - hold - 1) {
    const b = f.candles[i], fs = scoreAt(cf, i, { rr, atrMult }); i++;
    if (!fs.ok) continue;
    while (sk + 1 < s.candles.length && s.candles[sk + 1].t <= b.t) sk++;
    const g = combineTimeframes(fs, ss[sk]);
    const dir = Math.sign(fs.score) || Math.sign(ss[sk].score); if (!dir) continue;
    const a = fs.atr; if (!a) continue;
    const risk = atrMult * a, buy = dir > 0;
    const stop = buy ? b.c - risk : b.c + risk, target = buy ? b.c + risk * rr : b.c - risk * rr;
    let r = null, j = i;
    for (; j < i + hold; j++) { const k = f.candles[j]; if (buy ? k.l <= stop : k.h >= stop) { r = -1; break; } if (buy ? k.h >= target : k.l <= target) { r = rr; break; } }
    if (r === null) { const e = f.candles[j - 1].c; r = (buy ? e - b.c : b.c - e) / risk; }
    rs.push(r - COST); i = j + 1;
  }
  const w = rs.filter(x => x > 0).length;
  return { n: rs.length, win: Math.round(100 * w / rs.length), net: +rs.reduce((a, b) => a + b, 0).toFixed(1), perTrade: +(rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(3) };
}
console.log(`${symbol} · every trade = engine's lean · cost ${COST}R per trade\n`);
console.log('target:stop   stop(ATR)  hold  trades  win%   net R   R/trade');
for (const [rr, am] of [[2, 1.5], [1, 1.5], [0.5, 1.5], [0.33, 2.5], [0.25, 3], [0.2, 4]])
  for (const hold of [3]) { const r = run(rr, am, hold); console.log(`${String(rr).padEnd(13)} ${String(am).padEnd(10)} ${String(hold).padEnd(5)} ${String(r.n).padEnd(7)} ${String(r.win).padEnd(6)} ${String(r.net).padEnd(7)} ${r.perTrade}`); }
