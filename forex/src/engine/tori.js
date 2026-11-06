// tori.js — automated approximation of the Tori Trades (Victoria Duke) trendline
// swing strategy. Pure price action, NO indicators. 4-hour charts.
//
// Faithful pieces:
//   - qualified ("A+") trendlines: >=3 taps, >=6 candles between taps, >=3 weeks
//     span, slope not too steep.
//   - entry = a 4h candle CLOSES past the line (break).
//   - stop = ~$10 on the OPPOSITE side of the line (the "safety" side), then TRAILED.
//   - SKIP the trade when required risk is too wide (break too far from the line)
//     or the line isn't A+ — this is her "I'll pass this one" discretion.
//   - one attempt per trendline.
//
// Honest caveat: real trendline drawing is discretionary. This finds swing pivots
// and fits lines through >=3 touches within a tolerance — a close approximation,
// not a pixel-perfect copy of how Tori hand-draws them.

const CONFIRM_K = 3;          // a pivot is confirmed CONFIRM_K bars later (no look-ahead)
const WEEK_MS = 7 * 864e5;

// ---- 1h -> 4h resampling (Yahoo gives us 1h; Tori trades the 4h) ----------
export function resampleTo4h(candles) {
  const buckets = new Map();
  for (const c of candles) {
    const d = new Date(c.t);
    const bh = Math.floor(d.getUTCHours() / 4) * 4;
    const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), bh);
    const b = buckets.get(key);
    if (!b) buckets.set(key, { t: key, o: c.o, h: c.h, l: c.l, c: c.c });
    else { b.h = Math.max(b.h, c.h); b.l = Math.min(b.l, c.l); b.c = c.c; }
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

// ---- swing pivots ---------------------------------------------------------
export function pivots(candles, k = CONFIRM_K) {
  const highs = [], lows = [];
  for (let i = k; i < candles.length - k; i++) {
    let ph = true, pl = true;
    for (let j = i - k; j <= i + k; j++) {
      if (candles[j].h > candles[i].h) ph = false;
      if (candles[j].l < candles[i].l) pl = false;
    }
    if (ph) highs.push({ i, p: candles[i].h, t: candles[i].t });
    if (pl) lows.push({ i, p: candles[i].l, t: candles[i].t });
  }
  return { highs, lows };
}

// simple ATR for tolerance + steepness scaling
function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].h - candles[i].l,
      Math.abs(candles[i].h - candles[i - 1].c),
      Math.abs(candles[i].l - candles[i - 1].c)
    );
    sum += tr;
  }
  return sum / period;
}

// Fit the best qualified trendline through a set of pivots, evaluated as of bar
// `atNow` (only pivots confirmed by then are usable → no look-ahead).
//   isSupport=true  → line UNDER price built from pivot LOWS (an up-trendline)
//   isSupport=false → line OVER price built from pivot HIGHS (a down-trendline)
function fitLine(pv, candles, atNow, isSupport, a) {
  const tol = 0.45 * a;
  const usable = pv.filter(p => p.i + CONFIRM_K <= atNow && p.i < atNow);
  if (usable.length < 3) return null;

  let best = null;
  for (let x = 0; x < usable.length - 1; x++) {
    for (let y = x + 1; y < usable.length; y++) {
      const A = usable[x], B = usable[y];
      if (B.i - A.i < 6) continue;                 // taps must be 6+ candles apart
      const m = (B.p - A.p) / (B.i - A.i);
      const yAt = i => A.p + m * (i - A.i);

      // no pivot should pierce far through the line (support: none well below;
      // resistance: none well above) — keeps the line "valid"
      let pierced = false;
      const touches = [];
      for (const P of usable) {
        const dev = P.p - yAt(P.i);
        if (isSupport && dev < -tol) { pierced = true; break; }
        if (!isSupport && dev > tol) { pierced = true; break; }
        if (Math.abs(dev) <= tol) touches.push(P);
      }
      if (pierced) continue;
      if (touches.length < 3) continue;

      // span >= 3 weeks between first and last touch
      const span = touches[touches.length - 1].t - touches[0].t;
      if (span < 3 * WEEK_MS) continue;

      // slope not too steep: |price change per bar| under ~0.6*ATR
      if (Math.abs(m) > 0.6 * a) continue;

      const score = touches.length * 100 - Math.abs(m); // prefer more taps, flatter
      if (!best || score > best.score) {
        best = { A, B, m, yAt, touches: touches.length, lastTouchI: touches[touches.length - 1].i, score };
      }
    }
  }
  return best;
}

// Detect a fresh break at the latest closed bar `now`.
export function detectAt(candles, now, opts = {}) {
  const stopDist = opts.stopDist ?? 10;    // ~$10 safety-side stop (gold)
  const maxRisk = opts.maxRisk ?? 14;      // skip if required risk exceeds this
  const rr = opts.rr ?? 2;

  if (now < 40) return null;
  const a = atr(candles.slice(0, now + 1));
  if (!a) return null;
  const { highs, lows } = pivots(candles.slice(0, now + 1));
  const price = candles[now].c;
  const prev = candles[now - 1].c;

  // resistance line (from highs) → bullish break when we CLOSE above it
  const res = fitLine(highs, candles, now, false, a);
  // support line (from lows) → bearish break when we CLOSE below it
  const sup = fitLine(lows, candles, now, true, a);

  // maxRiskAtr: skip a break whose distance to the safety line exceeds this many
  // ATRs — that's Tori's "high-risk setup, too far from the safety line → pass".
  const maxRiskAtr = opts.maxRiskAtr ?? 3;
  const buffer = 0.25 * a; // stop sits just BEYOND the safety line, not on it

  const out = [];
  // BUY: price breaks ABOVE the down-trendline (resistance) → that's the ACTION
  //      line; the up-trendline (support) becomes the SAFETY line we trail.
  if (res && sup) {
    const lineNow = res.yAt(now), linePrev = res.yAt(now - 1);
    if (price > lineNow && prev <= linePrev) {
      out.push(makeSignal('BUY', price, sup, now, buffer, a, maxRiskAtr, res.touches));
    }
  }
  // SELL: price breaks BELOW the up-trendline (support) → ACTION line; the
  //       down-trendline (resistance) becomes the SAFETY line we trail.
  if (sup && res) {
    const lineNow = sup.yAt(now), linePrev = sup.yAt(now - 1);
    if (price < lineNow && prev >= linePrev) {
      out.push(makeSignal('SELL', price, res, now, buffer, a, maxRiskAtr, sup.touches));
    }
  }
  out.sort((x, y) => (x.skip === y.skip ? 0 : x.skip ? 1 : -1));
  return out[0] || null;
}

// Live state for the panel: a fresh break, a skipped break, or "watching" with
// the nearest qualified trendlines and how far price is from each.
export function liveAnalyze(candles, opts = {}) {
  const now = candles.length - 1;
  if (now < 40) return { state: 'insufficient' };
  const a = atr(candles.slice(0, now + 1));
  if (!a) return { state: 'insufficient' };

  const sig = detectAt(candles, now, opts);
  const { highs, lows } = pivots(candles.slice(0, now + 1));
  const res = fitLine(highs, candles, now, false, a);
  const sup = fitLine(lows, candles, now, true, a);
  const price = candles[now].c;

  const lines = [];
  if (res) lines.push({ kind: 'resistance', y: res.yAt(now), taps: res.touches, dist: res.yAt(now) - price });
  if (sup) lines.push({ kind: 'support', y: sup.yAt(now), taps: sup.touches, dist: price - sup.yAt(now) });

  if (sig && !sig.skip) return { state: 'break', sig, price, lines, atr: a };
  if (sig && sig.skip) return { state: 'skip', sig, price, lines, atr: a };
  return { state: 'watch', price, lines, atr: a };
}

// The SAFETY line is the opposite trend line. Its value trails as it slopes, so
// we carry its anchor+slope forward and project it each bar. There is NO fixed
// target — exit is purely "price breaks the safety line".
function makeSignal(action, entry, safetyLine, now, buffer, atr, maxRiskAtr, taps) {
  const safetyY = safetyLine.yAt(now);
  // initial stop is just beyond the safety line
  const stop = action === 'BUY' ? safetyY - buffer : safetyY + buffer;
  const risk = Math.abs(entry - stop);
  const skip = risk > maxRiskAtr * atr || risk <= 0;
  return {
    action, entry, stop, risk,
    safety: { aI: safetyLine.A.i, aP: safetyLine.A.p, m: safetyLine.m, buffer, side: action === 'BUY' ? 'below' : 'above' },
    taps, slope: safetyLine.m,
    skip,
    skipReason: skip ? `high-risk: break is $${risk.toFixed(1)} from the safety line (> ${maxRiskAtr}× ATR)` : null,
    reason: action === 'BUY' ? 'broke above the down-trendline (action line)' : 'broke below the up-trendline (action line)'
  };
}

// Project a safety line's price at bar index i (used to trail the stop).
export function safetyAt(safety, i) {
  const y = safety.aP + safety.m * (i - safety.aI);
  return safety.side === 'below' ? y - safety.buffer : y + safety.buffer;
}
