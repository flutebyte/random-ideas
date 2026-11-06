// tori_backtest.mjs — walk-forward backtest of the REAL Tori method on gold.
// Entry = break the action line. Exit = price breaks the SAFETY line (the
// opposite trend line), which trails as it slopes. No fixed target. Skip
// high-risk breaks (too far from the safety line). 1h→4h resample, no look-ahead.
//
//   node tools/tori_backtest.mjs XAUUSD
//
import { fetchCandles } from '../src/engine/data.js';
import { resampleTo4h, detectAt, safetyAt } from '../src/engine/tori.js';

const symbol = process.argv[2] || 'XAUUSD';
const MAXRISK_ATR = Number(process.env.MAXRISKATR || 3);
const COOLDOWN = 6;
const SPREAD_R = 0.05;

console.log(`\nTORI (real method) backtest — ${symbol} 4h · exit = safety-line break · skip > ${MAXRISK_ATR}×ATR risk\n`);

const h1 = await fetchCandles(symbol, '1h', '730d');
const c = resampleTo4h(h1.candles);
console.log(`4h candles: ${c.length}  (${new Date(c[0].t).toISOString().slice(0,10)} → ${new Date(c.at(-1).t).toISOString().slice(0,10)})`);

const entries = [];
let cooldownUntil = 0, skipped = 0;
for (let now = 40; now < c.length; now++) {
  if (now < cooldownUntil) continue;
  const sig = detectAt(c, now, { maxRiskAtr: MAXRISK_ATR });
  if (!sig) continue;
  if (sig.skip) { skipped++; continue; }
  entries.push({ ...sig, idx: now });
  cooldownUntil = now + COOLDOWN;
}

// simulate: exit when a bar crosses the trailing safety line
const trades = [];
for (const e of entries) {
  const up = e.action === 'BUY';
  let exit = null, exitIdx = null;
  for (let i = e.idx + 1; i < c.length; i++) {
    const safety = safetyAt(e.safety, i);
    const bar = c[i];
    if (up ? bar.l <= safety : bar.h >= safety) { exit = safety; exitIdx = i; break; }
  }
  if (exit == null) continue; // still open at end → discard
  const r = (up ? exit - e.entry : e.entry - exit) / e.risk - SPREAD_R;
  trades.push({ ...e, exit, exitIdx, r, bars: exitIdx - e.idx });
}

const n = trades.length;
const wins = trades.filter(t => t.r > 0);
const total = trades.reduce((s, t) => s + t.r, 0);
const gW = wins.reduce((s, t) => s + t.r, 0);
const gL = Math.abs(trades.filter(t => t.r <= 0).reduce((s, t) => s + t.r, 0));
let eq = 0, peak = 0, dd = 0;
for (const t of trades) { eq += t.r; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak); }
const avgWin = wins.length ? gW / wins.length : 0;
const losers = trades.filter(t => t.r <= 0);
const avgLoss = losers.length ? gL / losers.length : 0;

console.log(`\nSignals: ${n} taken, ${skipped} skipped (high-risk).`);
console.log(`----------------------------------------`);
console.log(`Win rate:      ${(n ? wins.length / n * 100 : 0).toFixed(1)}%  (${wins.length}W / ${losers.length}L)`);
console.log(`Total:         ${total.toFixed(1)} R`);
console.log(`Expectancy:    ${(n ? total / n : 0).toFixed(3)} R / trade`);
console.log(`Profit factor: ${(gL ? gW / gL : Infinity).toFixed(2)}`);
console.log(`Avg win ${avgWin.toFixed(2)}R · avg loss ${avgLoss.toFixed(2)}R  (trail lets winners run)`);
console.log(`Max drawdown:  ${dd.toFixed(1)} R`);
console.log(`Avg hold:      ${(n ? trades.reduce((s,t)=>s+t.bars,0)/n : 0).toFixed(1)} 4h-bars`);
console.log(`----------------------------------------`);
console.log(`Approx auto-drawn trend lines; safety-line trailing exit. Small sample = demo it, don't trust blindly.\n`);
