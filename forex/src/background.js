// background.js — service worker. Orchestrates: fetch candles (2 timeframes) ->
// compute confluence signal on each -> combine -> optional Gemini filter ->
// return to the content script. Also owns settings defaults and notifications.

import { fetchCandles } from './engine/data.js';
import { computeSignal, combineTimeframes, deriveAdvice } from './engine/signal.js';
import { geminiFilter, applyLlm } from './engine/gemini.js';
import { assessNews, applyNews } from './engine/news.js';
import { resampleTo4h, liveAnalyze } from './engine/tori.js';

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

async function analyzeScalp(symbol, s) {
  const [fastData, slowData] = await Promise.all([
    fetchCandles(symbol, '1m', '1d'),
    fetchCandles(symbol, '5m', '5d')
  ]);
  const fastSig = computeSignal(fastData.candles, SCALP_OPTS);
  const slowSig = computeSignal(slowData.candles, SCALP_OPTS);
  let signal = combineTimeframes(fastSig, slowSig, 'context');
  if (!signal.ok) return { ok: false, error: signal.error || 'analysis failed', symbol };
  if (signal.alignment !== 'aligned') { signal.action = 'NEUTRAL'; signal.levels = null; }
  signal.symbol = symbol; signal.fastTf = '1m'; signal.slowTf = '5m'; signal.profile = 'scalp';
  // A 3-minute trade is over long before news 30+ min away, so only look 30 min
  // ahead (the default 90 min halved confidence and kept the scalper on WAIT).
  signal = applyNews(signal, await assessNews(symbol, { beforeMin: 30 }));
  signal = deriveAdvice(signal, { weakMin: 55, strongMin: 70 });

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

async function analyzeIndex(symbol, s) {
  if (s.indexMode !== 'swing') return analyzeScalp(symbol, s);
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

async function analyze(symbol) {
  const s = await getSettings();
  if (isIndex(symbol)) return analyzeIndex(symbol, s);
  if (s.engine === 'tori') return analyzeTori(symbol, s);
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

  const r = liveAnalyze(c4, { stopDist: s.toriStop, maxRisk: s.toriMaxRisk, rr: s.rr });
  const price = r.price;
  const fmt = v => (v == null ? '—' : v >= 100 ? v.toFixed(1) : v.toFixed(4));

  // nearest-line reasons (shown in every state)
  const lineReasons = (r.lines || []).map(L => ({
    name: L.kind === 'resistance' ? 'Resistance line' : 'Support line',
    vote: L.kind === 'resistance' ? 'bear' : 'bull',
    detail: `${L.taps} taps · ${fmt(L.y)} (${L.dist >= 0 ? '$' + L.dist.toFixed(1) + ' away' : 'price past it'})`
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
    signal.levels = { entry: g.entry, stop: g.stop, target: g.target, rr: g.rr };
    signal.advice = `4h TRENDLINE BREAK — ${g.action}. ${g.reason} (${g.taps} taps). ` +
      `Enter now; stop $${s.toriStop} on the safety side (${fmt(g.stop)}) and TRAIL it as price moves. ` +
      `First target 2R (${fmt(g.target)}). One shot per line.`;
  } else if (r.state === 'skip') {
    signal.action = 'NEUTRAL'; signal.stance = 'WAIT'; signal.tier = 'wait';
    signal.confidence = 0; signal.score = 0;
    signal.advice = `A break formed but SKIP — ${r.sig.skipReason}. Tori passes these; wait for a tighter setup.`;
  } else if (r.state === 'watch') {
    signal.action = 'NEUTRAL'; signal.stance = 'WAIT'; signal.tier = 'wait';
    signal.confidence = 0; signal.score = 0;
    const near = (r.lines || []).map(L =>
      `${L.kind} ${fmt(L.y)} ($${Math.abs(L.dist).toFixed(1)} ${L.dist >= 0 ? 'away' : 'past'})`).join(' · ');
    signal.advice = near
      ? `No 4h break yet. Watching: ${near}. Enter only on a 4h CLOSE beyond a line.`
      : `No A+ trendline right now. Nothing to do — wait for a qualifying line to form.`;
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
    analyze(msg.symbol)
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
