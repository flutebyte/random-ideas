// Opening-range breakout + fair-value-gap entry (from the YouTube video). 1m candles.
// Range = first 5m candle 09:30-09:35 NY. Break = a 1m candle CLOSES beyond it. Entry = close of the 3rd candle of an FVG
// formed after the break. Stop = far end of the break candle. Target fixed 2R. One trade/day. 7d of data = ~5 sessions only.
import { fetchCandles } from '../src/engine/data.js';
const sym = process.argv[2] || 'SPX500', COST = Number(process.env.COST_PTS || 0.6), RR = Number(process.env.RR || 2);
const f = await fetchCandles(sym, '1m', '7d'); const c = f.candles;
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
const ny = t => { const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value])); return { d: `${p.year}-${p.month}-${p.day}`, m: (p.hour % 24) * 60 + Number(p.minute) }; };
const days = {}; c.forEach((b, i) => { const n = ny(b.t); (days[n.d] ||= []).push({ ...b, m: n.m }); });
let tot = 0, w = 0, n = 0;
for (const [d, bars] of Object.entries(days)) {
  const or = bars.filter(b => b.m >= 570 && b.m < 575); if (or.length < 4) continue;
  const hi = Math.max(...or.map(b => b.h)), lo = Math.min(...or.map(b => b.l));
  const rest = bars.filter(b => b.m >= 575 && b.m <= Number(process.env.END_MIN || 690)); let done = false;
  for (let i = 0; i < rest.length && !done; i++) {
    const B = rest[i], dir = B.c > hi ? 1 : B.c < lo ? -1 : 0; if (!dir) continue;
    for (let k = i + 2; k < rest.length && k <= i + 8; k++) {            // FVG ending at bar k
      const c1 = rest[k - 2], c3 = rest[k];
      const gap = dir > 0 ? c3.l > c1.h : c3.h < c1.l; if (!gap) continue;
      const e = c3.c, stop = dir > 0 ? B.l : B.h, risk = Math.abs(e - stop); if (risk < 0.5) break;
      const tgt = dir > 0 ? e + RR * risk : e - RR * risk; let r = null;
      for (let j = k + 1; j < rest.length; j++) { const q = rest[j];
        if (dir > 0 ? q.l <= stop : q.h >= stop) { r = -risk; break; } if (dir > 0 ? q.h >= tgt : q.l <= tgt) { r = RR * risk; break; } }
      if (r === null) { const l = rest[rest.length - 1].c; r = dir > 0 ? l - e : e - l; }
      const net = r - COST; n++; if (net > 0) w++; tot += net / risk; done = true;
      console.log(d, dir > 0 ? 'BUY ' : 'SELL', 'entry', e.toFixed(1), 'stop', stop.toFixed(1), 'risk', risk.toFixed(1), '->', (net / risk).toFixed(2) + 'R'); break;
    }
    if (done) break; if (i > 0 && false) break;
  }
}
console.log(`${sym}: ${n} trades · ${n ? Math.round(100 * w / n) : 0}% win · ${tot.toFixed(2)}R net of ${COST}pt spread (RR ${RR})`);
