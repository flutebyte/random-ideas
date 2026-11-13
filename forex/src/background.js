// background.js — service worker. Orchestrates: fetch candles (2 timeframes) ->
// compute confluence signal on each -> combine -> optional Gemini filter ->
// return to the content script. Also owns settings defaults and notifications.

import { fetchCandles } from './engine/data.js';
import { computeSignal, combineTimeframes, deriveAdvice } from './engine/signal.js';
import { geminiFilter, applyLlm } from './engine/gemini.js';
import { assessNews, applyNews } from './engine/news.js';
import { resampleTo4h, liveAnalyze } from './engine/tori.js';
import { closedContiguous, mergeLive, resample } from './engine/live.js';

const DEFAULTS = {
  fastTf: '15m',
  slowTf: '1h',
  rr: 2,
  atrMult: 1.5,
  engine: 'tori',        // 'tori' = trendline strategy (priority); 'indicators' = confluence
  toriStop: 10,          // $ stop from the safety line (gold-calibrated)
  toriMaxRisk: 14,       // skip a break if required risk exceeds this ($)
  htfMode: 'context',    // 'context' = bigger-picture guidance; 'filter' = strict veto
  useGemini: false,
  geminiKey: '',
  newsBeforeMin: 90,     // news awareness is ALWAYS on — not a toggle
  notify: true,
  notifyMinConfidence: 65,
  autoRefreshSec: 60,
  indexMode: 'scalp',    // 'scalp' = 1m entries, ~3 min hold; 'swing' = 1h/1d
  spreadPts: 0.3         // your round-trip spread+slippage in index POINTS
};

async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(stored.settings || {}) };
}

// Cache last notified action per symbol so we don't spam the same alert.
const lastNotified = {};

// Stock-index profile — tuned + validated by tools/tune_index.mjs (walk-forward,
// 2y hourly: S&P PF 1.05->~1.2; also improved NAS100/US30/DAX/NIFTY out-of-sample).
// Momentum-weighted, Bollinger read as trend strength, 1:3 R:R, daily-trend gate.
const INDEX_RE = /^(\^|SPX|SP500|US500|ES1|NDX|NAS100|US100|USTEC|NQ1|DJI|US30|DJ30|DOW|YM1|RUT|US2000|DAX|GER40|DE40|DE30|UK100|FTSE|NI225|JP225|NIKKEI|HSI|HK50|CAC40|FRA40|NIFTY|SENSEX)/;
const INDEX_OPTS = {
  weights: { trend: 25, momentum: 45, structure: 20, volatility: 10 },
  volMode: 'trend', rr: 3, atrMult: 1.5
};
export function isIndex(symbol) {
  const t = String(symbol || '').toUpperCase().split(':').pop().replace(/[^A-Z0-9^]/g, '');
  return INDEX_RE.test(t);
}

// 3-minute scalp profile. Backtest (7d of 1m SPX500, train/test split) is only
// profitable when round-trip cost <= ~0.08R, i.e. spread <= ~0.08 x stop. Edge
// vanishes at >= 0.10R, so we gate on it live instead of pretending.
const SCALP_OPTS = {
  weights: { trend: 25, momentum: 45, structure: 20, volatility: 10 },
  volMode: 'trend', rr: 2, atrMult: 1.5
};
const SCALP_MAX_COST_R = 0.08, SCALP_HOLD_BARS = 3;

// New York clock (handles US daylight saving automatically).
function nyMinutes(ms) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' }).formatToParts(new Date(ms));
  const g = t => parts.find(p => p.type === t)?.value;
  return { min: (Number(g('hour')) % 24) * 60 + Number(g('minute')), wd: g('weekday') };
}

// Opening-range breakout + fair-value-gap entry (from the "Scalping Strategy Works Everyday" video).
// Range = first 5-min candle 09:30-09:35 NY. Break = a 1m candle CLOSES beyond it. Enter at the close of the 3rd candle of a
// fair value gap formed after the break; stop = far end of the break candle; fixed 2R target. One trade per day (first signal).
export function orbFvgSetup(c1, now = Date.now(), s = {}) {
  const tf = s.orbTf || 3, rng = s.orbRange || 30, T = tf * 60000;      // candle size (min) and opening-range length (min)
  const { min, wd } = nyMinutes(now), hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  if (wd === 'Sat' || wd === 'Sun') return { ok: false, why: 'weekend.' };
  if (min < 570 + rng) return { ok: false, why: `waiting for the opening range (09:30-${hm(570 + rng)} New York) to form. It is ${hm(min)} in New York now.` };
  if (min > 930) return { ok: false, why: 'past 15:30 New York — too close to the US close, no new trades today.' };
  const bars = resample(c1.filter(b => now - b.t < 20 * 3600e3), T, now).filter(b => { const m = nyMinutes(b.t); return m.wd === wd && m.min >= 570 && m.min <= 930; });
  const or = bars.filter(b => nyMinutes(b.t).min < 570 + rng);
  if (or.length < Math.max(2, Math.floor(rng / tf) - 1)) return { ok: false, why: 'not enough opening-range candles in the data yet.' };
  const hi = Math.max(...or.map(b => b.h)), lo = Math.min(...or.map(b => b.l));
  const rest = bars.filter(b => nyMinutes(b.t).min >= 570 + rng);
  const last = rest[rest.length - 1];
  if (!last || now - (last.t + T) > T + 90000) return { ok: false, why: 'live data is stale — keep the chart tab open and visible.' };
  for (let i = 0; i < rest.length; i++) {
    const B = rest[i], dir = B.c > hi ? 1 : B.c < lo ? -1 : 0; if (!dir) continue;
    for (let k = i + 2; k < rest.length && k <= i + 8; k++) {
      const a = rest[k - 2], z = rest[k];
      if (!(dir > 0 ? z.l > a.h : z.h < a.l)) continue;
      if (k !== rest.length - 1) return { ok: false, why: 'the opening-range setup already fired earlier — one trade per day, wait for tomorrow.' };
      const e = z.c, stop = dir > 0 ? B.l : B.h, r = Math.abs(e - stop);
      if (r < 0.5) return { ok: false, why: 'stop too tight to trade.' };
      return { ok: true, dir: dir > 0 ? 'BUY' : 'SELL', levels: { entry: e, stop, target: dir > 0 ? e + 2 * r : e - 2 * r, rr: 2, riskPips: r, rewardPips: 2 * r } };
    }
  }
  return { ok: false, why: `range ${lo.toFixed(1)} – ${hi.toFixed(1)} (${tf}-min candles); none has closed outside it with a fair value gap yet.` };
}
// Returns {ok, dir, levels} when the NY-open breakout setup is live on the latest closed 3m bar.
export function selectiveSetup(c1, fastSig, s, now = Date.now()) {
  const { min, wd } = nyMinutes(now);
  if (wd === 'Sat' || wd === 'Sun') return { ok: false, why: 'weekend.' };
  if (min < 570 || min >= 720) return { ok: false, why: `outside the New York open window (09:30-12:00 NY). It is ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')} in New York.` };
  const c3 = resample(c1, 180000, now);
  if (c3.length < 20) return { ok: false, why: 'not enough 3-minute bars yet.' };
  const b = c3[c3.length - 1];
  if (now - (b.t + 180000) > 200000) return { ok: false, why: 'last 3-minute bar is stale — keep the chart tab open and visible.' };
  const prev = c3.slice(-11, -1);
  const hi = Math.max(...prev.map(x => x.h)), lo = Math.min(...prev.map(x => x.l));
  const dir = Math.sign(fastSig.score);
  const brk = b.c > hi ? 1 : b.c < lo ? -1 : 0;
  if (!brk) return { ok: false, why: `inside the 30-min range (${lo.toFixed(1)} – ${hi.toFixed(1)}), no breakout yet.` };
  if (brk !== dir) return { ok: false, why: 'range broke but the 1-minute engine disagrees with the direction.' };
  let atr = 0; for (let i = c3.length - 14; i < c3.length; i++) atr += Math.max(c3[i].h - c3[i].l, Math.abs(c3[i].h - c3[i - 1].c), Math.abs(c3[i].l - c3[i - 1].c));
  atr /= 14;
  const up = brk > 0, r = 1.5 * atr, e = c1[c1.length - 1].c;
  return { ok: true, dir: up ? 'BUY' : 'SELL', levels: { entry: e, stop: up ? e - r : e + r, target: up ? e + r : e - r, rr: 1, riskPips: r, rewardPips: r } };
}

async function analyzeScalp(symbol, s, liveBars, always = false) {
  // Yahoo (delayed ~10 min, futures price) provides history only. Fresh bars come
  // from the TradingView chart itself (broker feed) when the page sends them.
  const yahoo = await fetchCandles(symbol, '1m', '2d');
  let c1 = yahoo.candles, feed = 'yahoo', offset = 0;
  // Selective mode outside the NY-open window never trades, so it needs no live feed: skip warm-up/stale gates.
  const idle = always && s.scalpSelective !== false && /^(weekend|outside|past)/.test((s.scalpStrategy === 'breakout10' ? selectiveSetup(yahoo.candles, { score: 0 }, s) : orbFvgSetup(yahoo.candles, Date.now(), s)).why || '') || nyMinutes(Date.now()).min < 570;
  if (!idle && Array.isArray(liveBars) && liveBars.length) {
    const m = mergeLive(yahoo.candles, closedContiguous(liveBars));
    if (m.ok) { c1 = m.candles; feed = 'live'; offset = m.offset; }
    else if (m.reason === 'warmup' || m.reason === 'no-live') {
      // no-live: the tab just opened, no closed 1m bar yet — need Yahoo's lag + overlap.
      const lagMin = Math.ceil((Date.now() - yahoo.candles[yahoo.candles.length - 1].t) / 60000);
      const need = m.reason === 'warmup' ? m.needMin : lagMin + 3;
      return { ok: false, symbol, error: `Warming up live feed: ~${need} more min of chart data needed to line Yahoo up with your broker price (Yahoo is ~${lagMin} min delayed). Keep this TradingView tab open and visible.` };
    }
  }
  const ageSec = (Date.now() - (c1[c1.length - 1].t + 60000)) / 1000;
  // In selective mode stale data is fine: selectiveSetup() says NO TRADE (outside window / stale bar) itself.
  if (ageSec > 150 && !(always && s.scalpSelective !== false)) {
    return { ok: false, symbol, error: `Price data is ${Math.round(ageSec / 60)} min old — too stale for a 3-minute scalp. Skipped. (Needs the live chart feed: keep the TradingView tab open and visible.)` };
  }
  const fastData = { candles: c1 };
  const slowData = { candles: resample(c1, 300000) };
  const fastSig = computeSignal(fastData.candles, SCALP_OPTS);
  const slowSig = computeSignal(slowData.candles, SCALP_OPTS);
  let signal = combineTimeframes(fastSig, slowSig, 'context');
  if (!signal.ok) return { ok: false, error: signal.error || 'analysis failed', symbol };
  if (signal.alignment !== 'aligned') { signal.action = 'NEUTRAL'; signal.levels = null; }
  signal.symbol = symbol; signal.fastTf = '1m'; signal.slowTf = '5m'; signal.profile = 'scalp'; signal.feed = feed; signal.feedOffset = offset; signal.dataAgeSec = Math.round(ageSec);
  // A 3-minute trade is over long before news 30+ min away, so only look 30 min
  // ahead (the default 90 min halved confidence and kept the scalper on WAIT).
  signal = applyNews(signal, await assessNews(symbol, { beforeMin: 30 }));
  signal = deriveAdvice(signal, { weakMin: 55, strongMin: 70 });

  // SELECTIVE setup (default): trade ONLY the NY-open window (09:30-12:00 New York time) and ONLY
  // when the last closed 3m candle breaks the previous 30-min (10 x 3m) range in the engine's
  // direction. Backtest (3m candles): SPX500 ~70-75% wins vs ~48% unfiltered. Tiny sample.
  if (always && s.scalpSelective !== false) {
    const sel = s.scalpStrategy === 'breakout10' ? selectiveSetup(c1, fastSig, s) : orbFvgSetup(c1, Date.now(), s);
    if (!sel.ok) {
      return { ...signal, ok: true, action: 'NEUTRAL', stance: 'WAIT', tier: 'wait', levels: null, forced: false,
        advice: `NO TRADE — ${sel.why} Waiting is the edge: unfiltered 3-min scalping loses money in backtests.`, selective: true };
    }
    signal = { ...signal, action: sel.dir, stance: sel.dir, tier: 'strong', forced: false, selective: true,
      confidence: Math.max(signal.confidence || 0, 62), levels: sel.levels,
      advice: `${sel.dir} — opening-range break + fair value gap (${s.orbTf || 3}-min candles, ${s.orbRange || 30}-min range). ` };
    signal.scalp = { holdMin: 60, spread: s.spreadPts || 0 };
    const costR = (s.spreadPts || 0.3) / sel.levels.riskPips;
    signal.advice += `ENTER now · stop ${sel.levels.stop.toFixed(2)} · target ${sel.levels.target.toFixed(2)} · target is 2x the risk — EXIT at market after 60 min if neither is hit. Spread eats ~${(costR * 100).toFixed(0)}% of risk.`;
    maybeNotify(symbol, signal, s);
    return signal;
  }

  // ALWAYS-A-CALL mode: never leave the scalper on WAIT. If the engines don't agree,
  // lean with the 1m score (else the 5m score, else the last 3-bar move) and say plainly
  // that it is a low-conviction call. Only a red-news blackout still stands aside.
  if (always && !signal.newsBlackout && (signal.stance === 'WAIT' || !signal.levels)) {
    const last = c1[c1.length - 1], back = c1[Math.max(0, c1.length - 4)];
    const dir = Math.sign(fastSig.score) || Math.sign(slowSig.score) || Math.sign(last.c - back.c) || 1;
    const a1 = fastSig.atr || signal.atr || (last.h - last.l) || 1;
    const risk = SCALP_OPTS.atrMult * a1, up = dir > 0;
    signal.action = signal.stance = up ? 'BUY' : 'SELL';
    signal.tier = 'weak'; signal.forced = true;
    signal.confidence = Math.min(signal.confidence || 40, 54);
    signal.levels = { entry: last.c, stop: up ? last.c - risk : last.c + risk,
      target: up ? last.c + risk * SCALP_OPTS.rr : last.c - risk * SCALP_OPTS.rr, rr: SCALP_OPTS.rr, riskPips: risk, rewardPips: risk * SCALP_OPTS.rr };
    signal.advice = `${signal.stance} (low-conviction call — 1m/5m not fully aligned). `;
  }

  if (always && signal.levels && signal.stance !== 'WAIT') {
    signal.scalp = { holdMin: SCALP_HOLD_BARS, spread: s.spreadPts || 0 };
    const costR = (s.spreadPts || 0.3) / signal.levels.riskPips;
    signal.advice = (signal.forced ? signal.advice : '') +
      `${signal.forced ? '' : signal.stance + ' — '}ENTER now · stop ${signal.levels.stop.toFixed(2)} · target ${signal.levels.target.toFixed(2)} · ` +
      `EXIT at market after ${SCALP_HOLD_BARS} min if neither is hit. Spread eats ~${(costR * 100).toFixed(0)}% of risk.`;
    maybeNotify(symbol, signal, s);
    return signal;
  }

  if (signal.levels && signal.stance !== 'WAIT') {
    const costR = (s.spreadPts || 0.3) / signal.levels.riskPips;
    if (costR > SCALP_MAX_COST_R) {
      signal.stance = 'WAIT'; signal.tier = 'wait'; signal.levels = null;
      signal.advice = `Skip: stop is only ${(signal.atr * 1.5).toFixed(1)} pts vs your ${s.spreadPts} pt spread (${(costR * 100).toFixed(0)}% of risk). Backtest edge needs spread under ~8% of the stop.`;
    } else {
      signal.advice += ` SCALP: exit at market after ${SCALP_HOLD_BARS} minutes if neither stop nor target is hit. Cost ≈ ${(costR * 100).toFixed(0)}% of risk.`;
    }
  }
  maybeNotify(symbol, signal, s);
  return signal;
}

async function analyzeIndex(symbol, s, liveBars) {
  if (s.indexMode !== 'swing') return analyzeScalp(symbol, s, liveBars);
  const [fastData, slowData] = await Promise.all([
    fetchCandles(symbol, '1h', '6mo'),
    fetchCandles(symbol, '1d', '2y')
  ]);
  const fastSig = computeSignal(fastData.candles, INDEX_OPTS);
  const slowSig = computeSignal(slowData.candles, INDEX_OPTS);
  let signal = combineTimeframes(fastSig, slowSig, 'context');
  if (!signal.ok) return { ok: false, error: signal.error || 'analysis failed', symbol };
  // Backtest only traded when 1h and daily AGREE — anything else is WAIT.
  if (signal.alignment !== 'aligned') { signal.action = 'NEUTRAL'; signal.levels = null; }
  signal.symbol = symbol; signal.fastTf = '1h'; signal.slowTf = '1d'; signal.profile = 'index';
  signal = applyNews(signal, await assessNews(symbol, { beforeMin: s.newsBeforeMin }));
  signal = deriveAdvice(signal, { weakMin: 65, strongMin: 75 });
  maybeNotify(symbol, signal, s);
  return signal;
}

async function analyze(symbol, liveBars) {
  const s = await getSettings();
  // The Tori (trendline) engine is the priority strategy: it runs for EVERY
  // symbol, indices included. The index profiles only apply to the indicators engine.
  if (s.engine === 'scalp') return analyzeScalp(symbol, s, liveBars, true);   // 3-min scalper, ANY symbol
  if (s.engine === 'tori') return analyzeTori(symbol, s);
  if (isIndex(symbol)) return analyzeIndex(symbol, s, liveBars);
  const rangeFor = tf => {
    if (tf === '1mo') return '10y';   // ~120 monthly candles
    if (tf === '1wk') return '5y';    // ~260 weekly candles
    if (tf === '1d') return '2y';
    if (tf === '1h' || tf === '60m') return '1mo';
    return '5d';                       // intraday (5m/15m/30m)
  };

  const [fastData, slowData] = await Promise.all([
    fetchCandles(symbol, s.fastTf, rangeFor(s.fastTf)),
    fetchCandles(symbol, s.slowTf, rangeFor(s.slowTf))
  ]);

  const fastSig = computeSignal(fastData.candles, { rr: s.rr, atrMult: s.atrMult });
  const slowSig = computeSignal(slowData.candles, { rr: s.rr, atrMult: s.atrMult });
  let signal = combineTimeframes(fastSig, slowSig, s.htfMode);

  if (!signal.ok) return { ok: false, error: signal.error || 'analysis failed', symbol };

  signal.symbol = symbol;
  signal.fastTf = s.fastTf;
  signal.slowTf = s.slowTf;

  // News awareness is ALWAYS on. High-impact ("red") events dominate the call.
  const news = await assessNews(symbol, { beforeMin: s.newsBeforeMin });
  signal = applyNews(signal, news);

  if (s.useGemini && s.geminiKey) {
    const llm = await geminiFilter(s.geminiKey, symbol, signal);
    signal = applyLlm(signal, llm);
  }

  signal = deriveAdvice(signal); // final: stance (BUY/SELL/WAIT) + what-to-do
  maybeNotify(symbol, signal, s);
  return signal;
}

// ---- Tori trendline engine (priority) -------------------------------------
async function analyzeTori(symbol, s) {
  let h1;
  try { h1 = await fetchCandles(symbol, '1h', '6mo'); }
  catch (e) { return { ok: false, error: String(e.message || e), symbol }; }

  const c4 = resampleTo4h(h1.candles);
  if (c4.length < 60) return { ok: false, error: 'Not enough 4h data for trendlines.', symbol };

  const r = liveAnalyze(c4, { maxRiskAtr: s.toriMaxRiskAtr });
  const price = r.price;
  const fmt = v => (v == null ? '—' : v >= 100 ? v.toFixed(1) : v.toFixed(4));
  const unit = price >= 100 ? 'pts' : '';

  // nearest-line reasons (shown in every state)
  const lineReasons = (r.lines || []).map(L => ({
    name: L.kind === 'resistance' ? 'Resistance line' : 'Support line',
    vote: L.kind === 'resistance' ? 'bear' : 'bull',
    detail: `${L.taps} touches · ${fmt(L.y)} (${L.dist >= 0 ? L.dist.toFixed(1) + ' ' + unit + ' away' : 'price past it'})`
  }));

  let signal = {
    ok: true, symbol, engine: 'tori', price, timestamp: Date.now(),
    reasons: lineReasons.length ? lineReasons : [{ name: 'Trendlines', vote: 'neutral', detail: 'no A+ line yet' }]
  };

  if (r.state === 'break') {
    const g = r.sig;
    const conf = Math.min(85, 45 + g.taps * 8);
    signal.action = g.action; signal.stance = g.action;
    signal.confidence = conf; signal.tier = conf >= 65 ? 'strong' : 'weak';
    signal.score = g.action === 'BUY' ? conf : -conf;
    // Her rules: no fixed target. Stop sits just beyond the SAFETY line (the
    // opposite trendline) and trails along it; EXIT when price breaks that line.
    const risk = Math.abs(g.entry - g.stop);
    signal.levels = { entry: g.entry, stop: g.stop, target: g.action === 'BUY' ? g.entry + 2 * risk : g.entry - 2 * risk, rr: 2 };
    signal.advice = `${g.action} NOW — 4h close ${g.action === 'BUY' ? 'above' : 'below'} a ${g.taps}-touch trendline ` +
      `(${g.reason}). Stop ${fmt(g.stop)} just beyond the safety line (${risk.toFixed(1)} ${unit} risk) — trail it along ` +
      `the safety line. No fixed target: EXIT when a 4h candle breaks the safety line. Optional 2R marker shown.`;
  } else if (r.state === 'skip') {
    signal.action = 'NEUTRAL'; signal.stance = 'WAIT'; signal.tier = 'wait';
    signal.confidence = 0; signal.score = 0;
    signal.advice = `DON'T ${r.sig.action} — a break formed but ${r.sig.skipReason}. Too far from the safety line; Tori passes these. Wait for a tighter setup.`;
  } else if (r.state === 'watch') {
    signal.action = 'NEUTRAL'; signal.stance = 'WAIT'; signal.tier = 'wait';
    signal.confidence = 0; signal.score = 0;
    const near = (r.lines || []).map(L =>
      `${L.kind} ${fmt(L.y)} (${Math.abs(L.dist).toFixed(1)} ${unit} ${L.dist >= 0 ? 'away' : 'past'})`).join(' · ');
    signal.advice = near
      ? `DON'T BUY / SELL YET — no 4h break. Watching: ${near}. Buy only on a 4h CLOSE above the resistance line; sell only on a 4h CLOSE below the support line.`
      : `DON'T TRADE — no qualifying 3-touch trendline right now. Wait for one to form.`;
  } else {
    return { ok: false, error: 'Not enough 4h history to draw trendlines yet.', symbol };
  }

  // News still governs everything — red events force a stand-aside even on a break.
  const news = await assessNews(symbol, { beforeMin: s.newsBeforeMin });
  signal = applyNews(signal, news);
  if (signal.newsBlackout) {
    signal.stance = 'WAIT'; signal.tier = 'news';
    signal.advice = 'Red-news window — do NOT trade the break. Wait ~15 min after the release.';
  }

  maybeNotify(symbol, signal, s);
  return signal;
}

function maybeNotify(symbol, signal, s) {
  if (!s.notify) return;
  if (signal.stance === 'WAIT' || !signal.stance) return; // never alert on WAIT
  if (signal.confidence < s.notifyMinConfidence) return;
  const key = symbol + ':' + signal.stance;
  if (lastNotified[symbol] === key) return; // already alerted for this direction
  lastNotified[symbol] = key;
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `${signal.tier === 'strong' ? 'STRONG ' : ''}${signal.stance} ${symbol} — ${signal.confidence}%`,
      message: signal.advice || `Score ${signal.score}.`,
      priority: 1
    });
  } catch (_) { /* notifications permission may be absent; ignore */ }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ANALYZE') {
    analyze(msg.symbol, msg.liveBars)
      .then(sendResponse)
      .catch(e => sendResponse({ ok: false, error: String(e.message || e), symbol: msg.symbol }));
    return true; // async response
  }
  if (msg?.type === 'GET_SETTINGS') {
    getSettings().then(sendResponse);
    return true;
  }
  if (msg?.type === 'SAVE_SETTINGS') {
    // Merge onto EXISTING settings so a partial save (e.g. just the TF from the
    // overlay) doesn't reset unrelated fields like the Gemini key.
    getSettings().then(cur =>
      chrome.storage.local.set({ settings: { ...DEFAULTS, ...cur, ...msg.settings } })
        .then(() => sendResponse({ ok: true })));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get('settings');
  if (!cur.settings) await chrome.storage.local.set({ settings: DEFAULTS });
});
