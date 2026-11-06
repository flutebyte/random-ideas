// backtest.mjs — fast walk-forward backtest of the confluence engine on real
// Yahoo history, modelling the SAME multi-timeframe alignment gate the live
// extension uses. No look-ahead: at each fast bar we score using only closed
// data, require the higher timeframe to agree, then simulate the trade forward
// against the ATR stop/target.
//
//   node tools/backtest.mjs EURUSD            (defaults: fast 1h, slow 1d)
//   MINCONF=60 ALIGN=1 node tools/backtest.mjs GBPUSD
//
import { fetchCandles } from '../src/engine/data.js';
import { buildContext, scoreAt, combineTimeframes } from '../src/engine/signal.js';

const symbol = process.argv[2] || 'EURUSD';
const fastTf = process.argv[3] || '1h';
const slowTf = process.argv[4] || '1d';
const MIN_CONF = Number(process.env.MINCONF || 55);
const REQUIRE_ALIGN = process.env.ALIGN !== '0'; // default: require MTF alignment
const SPREAD_R = Number(process.env.SPREAD || 0.05); // spread/slippage cost per trade, in R

const RANGE = { '1h': '730d', '60m': '730d', '15m': '60d', '5m': '60d', '1d': '5y' };

console.log(`\nBacktest ${symbol}  fast=${fastTf} slow=${slowTf}  minConf=${MIN_CONF} align=${REQUIRE_ALIGN} spreadCost=${SPREAD_R}R\n`);

const fast = await fetchCandles(symbol, fastTf, RANGE[fastTf] || '730d');
const slow = await fetchCandles(symbol, slowTf, RANGE[slowTf] || '5y');
console.log(`Loaded fast=${fast.candles.length}  slow=${slow.candles.length} candles.`);

const ctxF = buildContext(fast.candles);
const ctxS = buildContext(slow.candles);

// Precompute slow-timeframe action at each slow bar (causal).
const slowSig = slow.candles.map((_, k) => scoreAt(ctxS, k));

// For a fast-bar timestamp, find the most recent CLOSED slow bar.
let sk = 0;
function slowAt(t) {
  while (sk + 1 < slow.candles.length && slow.candles[sk + 1].t <= t) sk++;
  return slowSig[sk];
}

const trades = [];
let pos = null;
for (let i = 55; i < fast.candles.length; i++) {
  const bar = fast.candles[i];

  if (pos) {
    const hitStop = pos.side === 'BUY' ? bar.l <= pos.stop : bar.h >= pos.stop;
    const hitTgt = pos.side === 'BUY' ? bar.h >= pos.target : bar.l <= pos.target;
    if (hitStop) { trades.push({ ...pos, r: -1 - SPREAD_R }); pos = null; }      // conservative: stop wins ties
    else if (hitTgt) { trades.push({ ...pos, r: pos.rr - SPREAD_R }); pos = null; }
    if (pos) continue;
  }

  const fs = scoreAt(ctxF, i);
  if (!fs.ok) continue;
  const ss = slowAt(bar.t);
  const sig = combineTimeframes(fs, ss);
  if (!sig.ok || sig.action === 'NEUTRAL' || !sig.levels) continue;
  if (REQUIRE_ALIGN && sig.alignment !== 'aligned') continue;
  if (sig.confidence < MIN_CONF) continue;

  pos = { side: sig.action, entry: bar.c, stop: sig.levels.stop, target: sig.levels.target,
          rr: sig.levels.rr, conf: sig.confidence, t: bar.t };
}

// ---- stats ----------------------------------------------------------------
const n = trades.length;
const wins = trades.filter(t => t.r > 0);
const winRate = n ? (wins.length / n) * 100 : 0;
const totalR = trades.reduce((s, t) => s + t.r, 0);
const grossWin = wins.reduce((s, t) => s + t.r, 0);
const grossLoss = Math.abs(trades.filter(t => t.r <= 0).reduce((s, t) => s + t.r, 0));
const pf = grossLoss ? grossWin / grossLoss : Infinity;
let eq = 0, peak = 0, maxDD = 0;
for (const t of trades) { eq += t.r; peak = Math.max(peak, eq); maxDD = Math.min(maxDD, eq - peak); }

console.log(`\n---------- RESULTS ----------`);
console.log(`Trades:        ${n}  (${(n / (fast.candles.length / (fastTf==='1h'?24:96))).toFixed(2)} per day approx)`);
console.log(`Win rate:      ${winRate.toFixed(1)}%   (breakeven at 1:${trades[0]?.rr || 2} needs ${(100/(1+(trades[0]?.rr||2))).toFixed(1)}%)`);
console.log(`Total return:  ${totalR.toFixed(1)} R`);
console.log(`Expectancy:    ${n ? (totalR / n).toFixed(3) : 0} R / trade`);
console.log(`Profit factor: ${pf.toFixed(2)}`);
console.log(`Max drawdown:  ${maxDD.toFixed(1)} R`);
console.log(`-----------------------------`);
console.log(`PF>1.2 & positive expectancy across several pairs = "worth a demo", not a guarantee.\n`);
