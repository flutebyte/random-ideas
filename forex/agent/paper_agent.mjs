// paper_agent.mjs — Tori trendline strategy running as an automated PAPER trader.
// No real money, no broker keys. It "buys/sells" in a simulated account, manages the
// trailing safety-line exit, and logs every decision. A real broker can later be
// plugged in by replacing `broker` below (see agent/README.md).
//
//   node agent/paper_agent.mjs --once                  # check once and exit
//   node agent/paper_agent.mjs                         # keep running (checks every 15 min)
//   node agent/paper_agent.mjs --replay SPX500         # replay history to prove the mechanics
//   node agent/paper_agent.mjs --symbols SPX500,XAUUSD,BTCUSD
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchCandles } from '../src/engine/data.js';
import { resampleTo4h, detectAt, safetyAt } from '../src/engine/tori.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(DIR, 'state.json');
const LOG_FILE = path.join(DIR, 'trades.log');

const CFG = {
  startEquity: 10000,
  riskPct: 0.01,          // risk 1% of equity per trade
  maxRiskAtr: 3,          // skip breaks too far from the safety line (Tori "high risk")
  maxOpen: 3,             // total simultaneous positions
  dailyLossPct: 0.03,     // stop opening new trades after losing 3% in a day
  pollMs: 15 * 60 * 1000
};

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SYMBOLS = (val('--symbols') || 'SPX500,XAUUSD,BTCUSD').split(',');

// ---- the broker seam: swap this object for a real broker adapter later -----
const broker = {
  name: 'paper',
  async openPosition(p) { return { filled: p.entry }; },   // simulated instant fill
  async closePosition(p, price) { return { filled: price }; }
};

function log(msg) {
  const line = `${new Date().toISOString()}  ${msg}`;
  console.log(line);
  if (!REPLAY) fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { equity: CFG.startEquity, open: [], closed: [], day: null, dayStartEquity: CFG.startEquity }; }
}
function saveState(s) { if (!REPLAY) fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

// Only fully CLOSED 4h bars — never act on a still-forming candle.
function closed4h(h1candles, nowMs) {
  const c4 = resampleTo4h(h1candles);
  while (c4.length && c4[c4.length - 1].t + 4 * 3600e3 > nowMs) c4.pop();
  return c4;
}

// One decision step for one symbol, using candles up to the latest CLOSED bar.
export async function step(state, symbol, c4, nowMs) {
  const idx = c4.length - 1;
  if (idx < 40) return;
  const bar = c4[idx];

  // ---- manage open position: exit when a bar breaks the trailing safety line ----
  const pos = state.open.find(p => p.symbol === symbol);
  if (pos) {
    const ei = c4.findIndex(b => b.t === pos.entryBarT);
    if (ei < 0) { log(`${symbol}: entry bar fell out of data window — keeping position, check manually`); }
    else {
      const aI = ei + pos.safety.aOff;
      for (let i = Math.max(ei + 1, pos.checkedFrom ?? 0); i <= idx; i++) {
        // Stop = safety line, but it may only TIGHTEN (never move away from price),
        // so a loss can't grow past ~1R if the safety line slopes against the trade.
        const line = safetyAt({ ...pos.safety, aI }, i);
        const lvl = pos.action === 'BUY' ? Math.max(pos.stop, line) : Math.min(pos.stop, line);
        pos.stop = lvl;
        const b = c4[i];
        const hit = pos.action === 'BUY' ? b.l <= lvl : b.h >= lvl;
        if (hit) {
          await broker.closePosition(pos, lvl);
          const pnl = (pos.action === 'BUY' ? lvl - pos.entry : pos.entry - lvl) * pos.qty;
          state.equity += pnl;
          state.open = state.open.filter(p => p !== pos);
          state.closed.push({ ...pos, exit: lvl, exitT: b.t, pnl, r: pnl / pos.riskDollars });
          log(`CLOSE ${pos.action} ${symbol} @ ${lvl.toFixed(2)} (safety line broken) P&L ${pnl.toFixed(2)} (${(pnl / pos.riskDollars).toFixed(2)}R) equity ${state.equity.toFixed(2)}`);
          return;
        }
      }
      pos.checkedFrom = idx + 1;
      const lvl = pos.stop;
      log(`HOLD ${pos.action} ${symbol} entry ${pos.entry.toFixed(2)} · trailing stop ${lvl.toFixed(2)} · last close ${bar.c.toFixed(2)}`);
      return;
    }
  }

  // ---- look for a fresh 3-touch trendline break on the latest closed bar ----
  const sig = detectAt(c4, idx, { maxRiskAtr: CFG.maxRiskAtr });
  if (!sig) { log(`WAIT ${symbol}: no 4h trendline break (last close ${bar.c.toFixed(2)})`); return; }
  if (sig.skip) { log(`SKIP ${symbol}: ${sig.action} break but ${sig.skipReason}`); return; }

  if (state.open.length >= CFG.maxOpen) { log(`SKIP ${symbol}: max open positions (${CFG.maxOpen})`); return; }
  const day = new Date(nowMs).toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.dayStartEquity = state.equity; }
  if (state.equity < state.dayStartEquity * (1 - CFG.dailyLossPct)) { log(`SKIP ${symbol}: daily loss limit hit`); return; }

  const riskDollars = state.equity * CFG.riskPct;
  const qty = riskDollars / sig.risk;                       // size so the stop = 1% of equity
  const fill = await broker.openPosition({ symbol, action: sig.action, entry: sig.entry, qty });
  state.open.push({
    symbol, action: sig.action, entry: fill.filled, qty, riskDollars,
    stop: sig.stop, entryBarT: bar.t, entryT: nowMs,
    safety: { aOff: sig.safety.aI - idx, aP: sig.safety.aP, m: sig.safety.m, buffer: sig.safety.buffer, side: sig.safety.side },
    taps: sig.taps
  });
  log(`OPEN ${sig.action} ${symbol} @ ${fill.filled.toFixed(2)} · stop ${sig.stop.toFixed(2)} · risk ${riskDollars.toFixed(2)} (1% equity) · qty ${qty.toFixed(4)} · ${sig.taps}-touch line`);
}

function summary(state) {
  const n = state.closed.length, w = state.closed.filter(t => t.pnl > 0).length;
  const tot = state.closed.reduce((s, t) => s + t.r, 0);
  log(`SUMMARY equity ${state.equity.toFixed(2)} · closed ${n} (${w} wins) · total ${tot.toFixed(2)}R · open ${state.open.length}`);
}

const REPLAY = flag('--replay');

async function runOnce(state) {
  const nowMs = Date.now();
  for (const sym of SYMBOLS) {
    try {
      const h1 = await fetchCandles(sym, '1h', '730d');
      await step(state, sym, closed4h(h1.candles, nowMs), nowMs);
    } catch (e) { log(`ERROR ${sym}: ${e.message}`); }
  }
  saveState(state);
  summary(state);
}

async function replay(sym) {
  const state = { equity: CFG.startEquity, open: [], closed: [], day: null, dayStartEquity: CFG.startEquity };
  const h1 = await fetchCandles(sym, '1h', '730d');
  const all = closed4h(h1.candles, Date.now());
  const origLog = console.log; let quiet = true;
  for (let i = 41; i < all.length; i++) {
    const t = all[i].t + 4 * 3600e3;
    quiet = true; console.log = () => {};
    await step(state, sym, all.slice(0, i + 1), t);
    console.log = origLog;
  }
  console.log = origLog;
  const n = state.closed.length, w = state.closed.filter(t => t.pnl > 0).length;
  const tot = state.closed.reduce((s, t) => s + t.r, 0);
  console.log(`REPLAY ${sym}: ${all.length} 4h bars · ${n} closed trades (${w} wins) · ${tot.toFixed(2)}R · equity ${CFG.startEquity} -> ${state.equity.toFixed(2)} · open now ${state.open.length}`);
  for (const t of state.closed.slice(-5)) console.log(`  ${t.action} @ ${t.entry.toFixed(1)} -> ${t.exit.toFixed(1)}  ${t.r.toFixed(2)}R`);
}

if (REPLAY) {
  await replay(val('--replay') || 'SPX500');
} else if (flag('--once')) {
  await runOnce(loadState());
} else {
  log(`paper agent started · symbols ${SYMBOLS.join(',')} · checking every ${CFG.pollMs / 60000} min · PAPER ONLY`);
  for (;;) { await runOnce(loadState()); await new Promise(r => setTimeout(r, CFG.pollMs)); }
}
