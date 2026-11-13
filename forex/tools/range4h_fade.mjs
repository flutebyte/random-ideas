// "4-hour range failed-breakout" scalp (video O5eC5lY7ZXY). Range = high/low of the first 4h NY-time candle (00:00-04:00 NY).
// After it closes: a candle CLOSES outside the range, then a later candle CLOSES back inside -> trade the re-entry (fade the break).
// Stop = extreme of the breakout move, target 2R, several trades/day allowed. TF env = candle minutes (3 or 5).
import { fetchCandles } from '../src/engine/data.js';
import { resample } from '../src/engine/live.js';
const sym = process.argv[2] || 'SPX500', TF = Number(process.env.TF || 3), RR = Number(process.env.RR || 2), COST = Number(process.env.COST_PTS || 0.6);
const f = await fetchCandles(sym, '1m', '7d'); const c = resample(f.candles, TF * 60000, Date.now() + 1e9);
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
const ny = t => { const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value])); return { d: `${p.year}-${p.month}-${p.day}`, m: (p.hour % 24) * 60 + Number(p.minute) }; };
const days = {}; c.forEach(b => { const n = ny(b.t); (days[n.d] ||= []).push({ ...b, m: n.m }); });
let n = 0, w = 0, tot = 0;
for (const [d, bars] of Object.entries(days)) {
  const first = bars.filter(b => b.m < 240); if (first.length < (240 / TF) * 0.8) continue;       // need most of the 00:00-04:00 candle
  const hi = Math.max(...first.map(b => b.h)), lo = Math.min(...first.map(b => b.l));
  const rest = bars.filter(b => b.m >= 240); let out = 0, ext = null, i = 0;
  while (i < rest.length) {
    const b = rest[i];
    if (!out) { if (b.c > hi) { out = 1; ext = b.h; } else if (b.c < lo) { out = -1; ext = b.l; } }
    else { ext = out > 0 ? Math.max(ext, b.h) : Math.min(ext, b.l);
      if (b.c <= hi && b.c >= lo) {                           // closed back inside -> enter against the break
        const buy = out < 0, e = b.c, risk = Math.abs(e - ext); const tgt = buy ? e + RR * risk : e - RR * risk; let r = null, j = i + 1;
        if (risk < 1) { out = 0; i++; continue; }
        for (; j < rest.length; j++) { const q = rest[j]; if (buy ? q.l <= ext : q.h >= ext) { r = -risk; break; } if (buy ? q.h >= tgt : q.l <= tgt) { r = RR * risk; break; } }
        if (r === null) { const l = rest[rest.length - 1].c; r = buy ? l - e : e - l; j = rest.length; }
        const net = r - COST; n++; if (net > 0) w++; tot += net / risk;
        console.log(d, buy ? 'BUY ' : 'SELL', 'entry', e.toFixed(1), 'stop', ext.toFixed(1), 'risk', risk.toFixed(1), (net / risk).toFixed(2) + 'R');
        out = 0; i = j; continue; } }
    i++;
  }
}
console.log(`${sym} ${TF}m: ${n} trades · ${n ? Math.round(100 * w / n) : 0}% win · ${tot.toFixed(2)}R net of ${COST}pt spread (RR ${RR})`);
