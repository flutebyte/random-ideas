// tune_index.mjs — grid search with train/test split (first 60% / last 40%).
import { fetchCandles } from '../src/engine/data.js';
import { buildContext, scoreAt, combineTimeframes } from '../src/engine/signal.js';
const symbol = process.argv[2] || 'SPX500';
const fast = await fetchCandles(symbol, '1h', '730d');
const slow = await fetchCandles(symbol, '1d', '5y');
const ctxF = buildContext(fast.candles), ctxS = buildContext(slow.candles);
const SPREAD = 0.05;
function run(o, from, to) {
  const slowSig = slow.candles.map((_, k) => scoreAt(ctxS, k, o));
  let sk = 0, pos = null, rs = [];
  for (let i = Math.max(55, from); i < to; i++) {
    const bar = fast.candles[i];
    if (pos) {
      const st = pos.side === 'BUY' ? bar.l <= pos.stop : bar.h >= pos.stop;
      const tg = pos.side === 'BUY' ? bar.h >= pos.target : bar.l <= pos.target;
      if (st) { rs.push(-1 - SPREAD); pos = null; } else if (tg) { rs.push(pos.rr - SPREAD); pos = null; }
      if (pos) continue;
    }
    const fs = scoreAt(ctxF, i, o); if (!fs.ok) continue;
    while (sk + 1 < slow.candles.length && slow.candles[sk + 1].t <= bar.t) sk++;
    const sig = combineTimeframes(fs, slowSig[sk]);
    if (!sig.levels || sig.action === 'NEUTRAL' || sig.alignment !== 'aligned' || sig.confidence < (o.minConf || 55)) continue;
    pos = { side: sig.action, stop: sig.levels.stop, target: sig.levels.target, rr: sig.levels.rr };
  }
  const gw = rs.filter(r => r > 0).reduce((a, b) => a + b, 0), gl = -rs.filter(r => r <= 0).reduce((a, b) => a + b, 0);
  return { n: rs.length, R: +rs.reduce((a, b) => a + b, 0).toFixed(1), pf: +(gl ? gw / gl : 9).toFixed(2) };
}
const N = fast.candles.length, cut = Math.floor(N * 0.6);
const W = { default: undefined, trendHeavy: { trend: 40, momentum: 25, structure: 25, volatility: 10 },
  noVol: { trend: 35, momentum: 30, structure: 35, volatility: 0 }, momHeavy: { trend: 25, momentum: 45, structure: 20, volatility: 10 } };
const rows = [];
for (const [wn, weights] of Object.entries(W))
 for (const volMode of ['mr', 'trend'])
  for (const longOnly of [false, true])
   for (const rr of [1.5, 2, 3])
    for (const atrMult of [1, 1.5, 2.5])
     for (const minConf of [55, 65]) {
      const o = { weights, volMode, longOnly, rr, atrMult, minConf };
      rows.push({ wn, volMode, longOnly, rr, atrMult, minConf, tr: run(o, 0, cut), te: run(o, cut, N) });
     }
const ok = rows.filter(r => r.tr.n >= 60 && r.te.n >= 40).sort((a, b) => b.tr.pf - a.tr.pf);
console.log('Top 12 by TRAIN pf, showing TEST (out-of-sample):');
for (const r of ok.slice(0, 12)) console.log(JSON.stringify([r.wn, r.volMode, r.longOnly ? 'long' : 'both', 'rr' + r.rr, 'atr' + r.atrMult, 'c' + r.minConf]), 'train', JSON.stringify(r.tr), 'test', JSON.stringify(r.te));
const both = ok.filter(r => r.tr.pf > 1.1 && r.te.pf > 1.1);
console.log('\nPositive in BOTH halves (pf>1.1):', both.length, 'of', ok.length);
for (const r of both.sort((a,b)=>(b.tr.pf+b.te.pf)-(a.tr.pf+a.te.pf)).slice(0, 8)) console.log(JSON.stringify([r.wn, r.volMode, r.longOnly ? 'long' : 'both', 'rr' + r.rr, 'atr' + r.atrMult, 'c' + r.minConf]), 'train', JSON.stringify(r.tr), 'test', JSON.stringify(r.te));
