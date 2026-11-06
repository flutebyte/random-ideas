// signal.js — confluence scoring engine.
// Combines FOUR non-redundant families of signal (each measures a DIFFERENT
// aspect of price, per the confluence research) into one score in [-100, +100]:
//   1. Trend       — EMA20 vs EMA50 relationship + slope
//   2. Momentum    — RSI(14) + MACD histogram
//   3. Volatility  — Bollinger %B (mean-reversion / breakout)
//   4. Structure   — swing highs/lows (higher-highs vs lower-lows)
// The score maps to BUY / SELL / NEUTRAL with a confidence derived from how
// much the families AGREE. Suggested stop/target come from ATR at a fixed R:R.
//
// All indicators are CAUSAL, so we precompute them once (buildContext) and the
// per-bar scorer (scoreAt) just reads index i. This makes the live engine and
// the walk-forward backtest share ONE code path (no drift, no O(n^2)).

import { ema, rsi, macd, bollinger, atr, swingStructure } from './indicators.js';

const WEIGHTS = { trend: 30, momentum: 30, structure: 25, volatility: 15 };

export function buildContext(candles) {
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);
  return {
    candles, closes, highs, lows,
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    bb: bollinger(closes, 20, 2),
    atr14: atr(highs, lows, closes, 14)
  };
}

// Score a single bar at index i using precomputed context. Returns the full
// signal object (same shape the UI + backtest consume).
export function scoreAt(ctx, i, opts = {}) {
  const W = opts.weights || WEIGHTS;
  const rr = opts.rr || 2;
  const atrMult = opts.atrMult || 1.5;
  const price = ctx.closes[i];

  if (i < 55 || price == null) {
    return { ok: false, error: 'Not enough candles to compute a reliable signal.' };
  }

  const reasons = [];
  let score = 0;

  // --- 1. TREND ---------------------------------------------------------
  const e20 = ctx.ema20[i], e50 = ctx.ema50[i];
  const e20prev = ctx.ema20[i - 5]; // slope over ~5 bars
  const slope = e20 != null && e20prev != null ? (e20 - e20prev) / e20prev : 0;
  let trendVote = 0;
  if (e20 != null && e50 != null) {
    if (e20 > e50) trendVote += 0.6; else if (e20 < e50) trendVote -= 0.6;
  }
  if (slope > 0) trendVote += 0.4; else if (slope < 0) trendVote -= 0.4;
  trendVote = clamp(trendVote, -1, 1);
  score += trendVote * W.trend;
  reasons.push({
    name: 'Trend (EMA20/50)', vote: voteLabel(trendVote),
    detail: `EMA20 ${e20 > e50 ? 'above' : 'below'} EMA50, slope ${slope >= 0 ? 'up' : 'down'}`
  });

  // --- 2. MOMENTUM ------------------------------------------------------
  const r = ctx.rsi14[i];
  const hist = ctx.macd.hist[i];
  let momVote = 0;
  if (r != null) {
    if (r >= 55) momVote += 0.5; else if (r <= 45) momVote -= 0.5;
    if (r >= 70) momVote -= 0.2; else if (r <= 30) momVote += 0.2;
  }
  if (hist != null) { if (hist > 0) momVote += 0.5; else if (hist < 0) momVote -= 0.5; }
  momVote = clamp(momVote, -1, 1);
  score += momVote * W.momentum;
  reasons.push({
    name: 'Momentum (RSI+MACD)', vote: voteLabel(momVote),
    detail: `RSI ${r == null ? 'n/a' : r.toFixed(1)}, MACD hist ${hist >= 0 ? '+' : ''}${fmt(hist)}`
  });

  // --- 3. STRUCTURE -----------------------------------------------------
  const struct = swingStructure(ctx.highs, ctx.lows, 20, i);
  const structVote = struct.trend;
  score += structVote * W.structure;
  reasons.push({ name: 'Structure (swings)', vote: voteLabel(structVote), detail: struct.detail });

  // --- 4. VOLATILITY / MEAN REVERSION ----------------------------------
  const pctB = ctx.bb.pctB[i];
  let volVote = 0;
  if (pctB != null && opts.volMode === 'trend') {
    // trend-following variant: riding the upper band is strength, not exhaustion
    if (pctB >= 0.8) volVote += 0.5; else if (pctB <= 0.2) volVote -= 0.5;
  } else if (pctB != null) {
    if (pctB <= 0.1) volVote += 0.8;
    else if (pctB < 0.35) volVote += 0.3;
    else if (pctB >= 0.9) volVote -= 0.8;
    else if (pctB > 0.65) volVote -= 0.3;
  }
  score += volVote * W.volatility;
  reasons.push({
    name: 'Volatility (Bollinger %B)', vote: voteLabel(volVote),
    detail: pctB != null ? `%B ${(pctB * 100).toFixed(0)}% of band range` : 'n/a'
  });

  // --- AGGREGATE --------------------------------------------------------
  score = clamp(score, -100, 100);
  const th = opts.threshold || 25;
  let action = score >= th ? 'BUY' : score <= -th ? 'SELL' : 'NEUTRAL';
  if (opts.longOnly && action === 'SELL') action = 'NEUTRAL';

  const dir = Math.sign(score);
  const votes = [trendVote, momVote, structVote, volVote];
  const agree = votes.filter(v => Math.sign(v) === dir && v !== 0).length;
  const total = votes.filter(v => v !== 0).length || 1;
  const agreement = agree / total;
  const confidence = Math.round(clamp(Math.abs(score) * 0.7 + agreement * 30, 0, 100));

  // --- SUGGESTED LEVELS (ATR-based, fixed R:R — NO martingale) ----------
  const a = ctx.atr14[i] || 0;
  let levels = null;
  if (action !== 'NEUTRAL' && a > 0) {
    const sideUp = action === 'BUY';
    const stopDist = atrMult * a;
    const stop = sideUp ? price - stopDist : price + stopDist;
    const target = sideUp ? price + stopDist * rr : price - stopDist * rr;
    levels = { entry: price, stop, target, rr, riskPips: stopDist, rewardPips: stopDist * rr };
  }

  return {
    ok: true, price, score: Math.round(score), action, confidence,
    agreement: Math.round(agreement * 100), reasons, levels, atr: a,
    timestamp: ctx.candles[i]?.t || Date.now()
  };
}

// Live convenience: build context and score the most recent bar.
export function computeSignal(candles, opts = {}) {
  if (candles.length < 60) return { ok: false, error: 'Not enough candles to compute a reliable signal.' };
  const ctx = buildContext(candles);
  return scoreAt(ctx, candles.length - 1, opts);
}

// Translate a fully-processed signal (after MTF + news + LLM) into a concrete
// STANCE (BUY / SELL / WAIT) and a plain-English "what to do" instruction.
// The key idea the user asked for: a low-conviction lean is NOT a trade — it's
// WAIT. We only show a direction once confidence clears a tradeable bar. This
// also kills the flip-flop, because the whole low-confidence zone reads "WAIT".
export function deriveAdvice(sig, opts = {}) {
  if (!sig?.ok) return sig;
  const strongMin = opts.strongMin || 70;
  const weakMin = opts.weakMin || 55;
  const out = { ...sig };
  const lean = sig.action; // BUY / SELL / NEUTRAL after all layers

  if (sig.newsBlackout) {
    out.stance = 'WAIT'; out.tier = 'news';
    out.advice = 'Red-news window — do NOT trade. Wait ~15 min after the release for spreads to settle, then re-check.';
    return out;
  }
  if (lean === 'NEUTRAL' || sig.confidence < weakMin) {
    out.stance = 'WAIT'; out.tier = 'wait';
    const dir = sig.score > 6 ? 'slight buy lean' : sig.score < -6 ? 'slight sell lean' : 'flat / chop';
    out.advice = `No clear edge — ${dir} at only ${sig.confidence}%. Stay flat; don't force it. Act only from ${weakMin}%+.`;
    return out;
  }
  const ht = sig.higherTF ? sig.higherTF.action : null;
  const ctNote = sig.counterTrend
    ? ` ⚠ Counter-trend: the higher TF is ${ht}, so this is a short-term reversal — use a tighter target and smaller size.`
    : '';

  if (sig.confidence < strongMin) {
    out.stance = lean; out.tier = sig.counterTrend ? 'weak' : 'weak';
    out.advice = `Weak ${lean} (${sig.confidence}%). Wait for the current bar to CLOSE to confirm, or take small size.${ctNote}`;
    return out;
  }
  out.stance = lean; out.tier = 'strong';
  out.advice = `Strong ${lean} (${sig.confidence}%). Use the stop & target below — never widen the stop.${ctNote}`;
  return out;
}

// Merge two timeframe signals into a final call. Alignment across timeframes is
// the single biggest confluence booster; disagreement caps the confidence.
// mode:
//   'context' (default) — higher TF is the BIG PICTURE, not a veto. A fast signal
//                         against it still shows, flagged as counter-trend, with a
//                         moderate confidence cut. Catches short-term reversals.
//   'filter'            — strict: only trade WITH the higher trend (best backtest
//                         edge on gold). A conflict forces WAIT.
export function combineTimeframes(fast, slow, mode = 'context') {
  if (!fast?.ok) return slow;
  if (!slow?.ok) return fast;
  const aligned = fast.action === slow.action && fast.action !== 'NEUTRAL';
  const opposed =
    (fast.action === 'BUY' && slow.action === 'SELL') ||
    (fast.action === 'SELL' && slow.action === 'BUY');

  const base = { ...fast };
  base.higherTF = { action: slow.action, confidence: slow.confidence, score: slow.score };
  base.htfMode = mode;

  if (aligned) {
    base.confidence = Math.min(100, Math.round(fast.confidence * 1.15 + 5));
    base.alignment = 'aligned';
  } else if (opposed) {
    if (mode === 'filter') {
      base.confidence = Math.round(fast.confidence * 0.5);
      base.action = 'NEUTRAL';
      base.levels = null;
      base.alignment = 'conflict';
    } else {
      // context: keep the fast direction, mark it counter-trend, cut confidence lightly
      base.confidence = Math.round(fast.confidence * 0.8);
      base.alignment = 'counter';
      base.counterTrend = true;
    }
  } else {
    base.confidence = Math.round(fast.confidence * 0.85);
    base.alignment = 'mixed';
  }
  return base;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function voteLabel(v) { return v > 0.15 ? 'bull' : v < -0.15 ? 'bear' : 'neutral'; }
function fmt(v) { return v == null ? 'n/a' : Math.abs(v) < 0.001 ? v.toExponential(1) : v.toFixed(4); }
