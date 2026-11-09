// live.js — fuse delayed Yahoo history with live 1-minute bars sampled from the
// TradingView chart (the user's real broker feed). Pure functions, no chrome.*.
//
// Why: Yahoo's futures feed lags ~10 min and sits tens of points off a broker's
// CFD price. A 3-minute scalp needs fresh bars in the broker's price terms.
// Method: shift Yahoo history by the median close difference over the minutes
// both sources cover, then append the live bars. Indicators then see one
// continuous series in broker prices.

const MIN = 60000;

// Parse the chart price out of TradingView's page title: "SPX500USD 7,405.6 ▲ +0.28% ..."
export function priceFromTitle(title) {
  const m = String(title || '').match(/\s(\d[\d,]*\.?\d*)\s*[▲▼▶]/) || String(title || '').match(/\s(\d[\d,]*\.\d+)\s/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
}

// Add one price sample to a bar list (mutates). 1-minute buckets.
export function addTick(bars, price, now = Date.now(), keep = 400) {
  const t = Math.floor(now / MIN) * MIN;
  const last = bars[bars.length - 1];
  if (last && last.t === t) {
    if (price > last.h) last.h = price;
    if (price < last.l) last.l = price;
    last.c = price;
  } else {
    bars.push({ t, o: price, h: price, l: price, c: price });
    if (bars.length > keep) bars.splice(0, bars.length - keep);
  }
  return bars;
}

// Trailing run of CLOSED live bars with no gap > maxGapMin (page was closed etc).
export function closedContiguous(bars, now = Date.now(), maxGapMin = 3) {
  const closed = (bars || []).filter(b => b.t + MIN <= now);
  let start = closed.length;
  for (let i = closed.length - 1; i >= 0; i--) {
    if (i < closed.length - 1 && closed[i + 1].t - closed[i].t > maxGapMin * MIN) break;
    start = i;
  }
  return closed.slice(start);
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

// yahoo: closed Yahoo 1m candles. live: closed contiguous live bars.
// Returns { ok, candles, offset, overlap } or { ok:false, reason, needMin }.
export function mergeLive(yahoo, live, minOverlap = 3) {
  if (!live || live.length < 1) return { ok: false, reason: 'no-live', needMin: minOverlap };
  const byT = new Map(yahoo.map(c => [c.t, c]));
  const diffs = [];
  for (const b of live) { const y = byT.get(b.t); if (y) diffs.push(b.c - y.c); }
  if (diffs.length < minOverlap) {
    // Yahoo lags: live bars must reach back far enough to overlap its newest bars.
    const yLast = yahoo.length ? yahoo[yahoo.length - 1].t : 0;
    const needMin = Math.max(1, Math.ceil((live[0].t - (yLast - (minOverlap - 1) * MIN)) / MIN));
    return { ok: false, reason: 'warmup', needMin: Math.max(1, needMin), overlap: diffs.length };
  }
  const offset = median(diffs);
  const firstLive = live[0].t;
  const hist = yahoo.filter(c => c.t < firstLive).map(c => ({ t: c.t, o: c.o + offset, h: c.h + offset, l: c.l + offset, c: c.c + offset }));
  return { ok: true, candles: hist.concat(live), offset, overlap: diffs.length };
}

// Resample 1m candles into CLOSED bars of `ms` (e.g. 5 min), aligned to the clock.
export function resample(candles, ms, now = Date.now()) {
  const out = []; let cur = null;
  for (const c of candles) {
    const b = Math.floor(c.t / ms) * ms;
    if (!cur || cur.t !== b) { if (cur) out.push(cur); cur = { t: b, o: c.o, h: c.h, l: c.l, c: c.c }; }
    else { cur.h = Math.max(cur.h, c.h); cur.l = Math.min(cur.l, c.l); cur.c = c.c; }
  }
  if (cur) out.push(cur);
  return out.filter(b => b.t + ms <= now);
}
