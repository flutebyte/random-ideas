// scalp_backtest.mjs — 1m entries, ~3-minute holds (time exit), 5m trend gate.
// Yahoo only serves 7 days of 1m data, so samples are small: treat as indicative.
import { fetchCandles } from '../src/engine/data.js';
import { buildContext, scoreAt, combineTimeframes } from '../src/engine/signal.js';
const symbol = process.argv[2] || 'SPX500';
const f = await fetchCandles(symbol, '1m', '7d'), s = await fetchCandles(symbol, '5m', '30d');
console.log(symbol, '1m bars', f.candles.length, '5m bars', s.candles.length);
const cf = buildContext(f.candles), cs = buildContext(s.candles);
const medAtr = [...cf.atr14.filter(x => x)].sort((a, b) => a - b)[Math.floor(cf.atr14.length / 2)];
console.log('median 1m ATR', medAtr.toFixed(2), 'price', f.candles.at(-1).c.toFixed(1));
function run(o, from, to) {
  const ss = s.candles.map((_, k) => scoreAt(cs, k, o)); let sk = 0, rs = [], i = Math.max(55, from);
  while (i < to) {
    const b = f.candles[i]; const fs = scoreAt(cf, i, o); i++;
    if (!fs.ok) continue;
    while (sk + 1 < s.candles.length && s.candles[sk + 1].t <= b.t) sk++;
    const g = combineTimeframes(fs, ss[sk]);
    if (!g.levels || g.action === 'NEUTRAL' || g.confidence < o.minConf || (o.align && g.alignment !== 'aligned')) continue;
    const buy = g.action === 'BUY', { stop, target } = g.levels; let r = null, j = i;
    for (; j < Math.min(to, i + o.hold); j++) {
      const k = f.candles[j];
      if (buy ? k.l <= stop : k.h >= stop) { r = -1; break; }
      if (buy ? k.h >= target : k.l <= target) { r = g.levels.rr; break; }
    }
    if (r === null) { const e = f.candles[Math.min(j, to - 1)].c; r = ((buy ? e - b.c : b.c - e) / (g.levels.riskPips)); }
    rs.push(r - o.cost); i = j + 1;   // flat until trade ends
  }
  const gw = rs.filter(x => x > 0).reduce((a, b) => a + b, 0), gl = -rs.filter(x => x <= 0).reduce((a, b) => a + b, 0);
  return { n: rs.length, R: +rs.reduce((a, b) => a + b, 0).toFixed(1), pf: +(gl ? gw / gl : 9).toFixed(2) };
}
const N = f.candles.length, cut = Math.floor(N * 0.6), rows = [];
const W = { def: undefined, mom: { trend: 25, momentum: 45, structure: 20, volatility: 10 } };
for (const [wn, weights] of Object.entries(W)) for (const volMode of ['mr', 'trend']) for (const rr of [1, 1.5, 2])
 for (const atrMult of [0.8, 1.5]) for (const hold of [3, 5]) for (const minConf of [55, 70]) for (const align of [true, false]) {
  const o = { weights, volMode, rr, atrMult, hold, minConf, align, cost: Number(process.env.COST || 0.15) };
  rows.push({ k: [wn, volMode, 'rr' + rr, 'atr' + atrMult, 'hold' + hold, 'c' + minConf, align ? 'align' : 'any'].join(' '), tr: run(o, 0, cut), te: run(o, cut, N) });
}
const ok = rows.filter(r => r.tr.n >= 25 && r.te.n >= 15);
console.log('baseline-ish (def mr rr1.5 atr1.5 hold3 c55 any):', JSON.stringify(rows.find(r => r.k === 'def mr rr1.5 atr1.5 hold3 c55 any')));
const both = ok.filter(r => r.tr.pf > 1.1 && r.te.pf > 1.1).sort((a, b) => b.tr.pf + b.te.pf - a.tr.pf - a.te.pf);
console.log('profitable in BOTH halves:', both.length, 'of', ok.length);
for (const r of both.slice(0, 8)) console.log(r.k, 'train', JSON.stringify(r.tr), 'test', JSON.stringify(r.te));
const avg = ok.reduce((a, r) => a + r.te.pf, 0) / ok.length; console.log('mean test PF across all configs:', avg.toFixed(2));
