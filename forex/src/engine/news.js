// news.js — ForexFactory economic-calendar awareness (the fundamental layer).
// Uses the free faireconomy JSON mirror of the ForexFactory weekly calendar.
// Pro rule of thumb: DON'T trade right around high-impact news — spreads blow
// out and price whipsaws. So near a high-impact event for a relevant currency we
// caution (cut confidence) or stand aside (NEUTRAL) rather than trust the chart.

const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

let cache = { at: 0, events: null };
const CACHE_MS = 20 * 60 * 1000; // calendar is weekly; refetch at most every 20 min

async function getEvents() {
  if (cache.events && Date.now() - cache.at < CACHE_MS) return cache.events;
  const res = await fetch(FEED, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('news HTTP ' + res.status);
  const data = await res.json();
  cache = { at: Date.now(), events: Array.isArray(data) ? data : [] };
  return cache.events;
}

// Which currencies does this symbol react to?
export function currenciesFor(symbol) {
  let s = String(symbol || '').toUpperCase();
  if (s.includes(':')) s = s.split(':').pop();
  s = s.replace(/[^A-Z]/g, '');
  // metals & crypto trade mostly off USD / risk sentiment
  if (/^XAU|^XAG|^XPT|^XPD|GOLD|SILVER/.test(s)) return ['USD'];
  if (/^BTC|^ETH|^SOL|^XRP|^BNB|^DOGE|^ADA/.test(s)) return ['USD'];
  if (/^[A-Z]{6}$/.test(s)) return [s.slice(0, 3), s.slice(3, 6)];
  return ['USD'];
}

const IMPACT_RANK = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

// Assess news risk around `now` for a symbol.
//   beforeMin: minutes AHEAD to look (avoid trading into news)
//   afterMin:  minutes AFTER an event to still treat as volatile
export async function assessNews(symbol, opts = {}) {
  const beforeMin = opts.beforeMin ?? 60;
  const afterMin = opts.afterMin ?? 15;
  const ccys = currenciesFor(symbol);
  let events;
  try { events = await getEvents(); }
  catch (e) { return { ok: false, error: String(e.message || e), ccys }; }

  const now = Date.now();
  const relevant = [];
  for (const e of events) {
    if (!ccys.includes(e.country)) continue;
    const rank = IMPACT_RANK[e.impact] || 0;
    if (rank < 2) continue; // only Medium/High matter for caution
    const t = Date.parse(e.date);
    if (isNaN(t)) continue;
    const minsAway = Math.round((t - now) / 60000); // +future / -past
    // window: from afterMin in the past to beforeMin in the future
    if (minsAway <= beforeMin && minsAway >= -afterMin) {
      relevant.push({ title: e.title, ccy: e.country, impact: e.impact, minsAway,
        forecast: e.forecast, previous: e.previous });
    }
  }
  relevant.sort((a, b) => Math.abs(a.minsAway) - Math.abs(b.minsAway));

  // Next upcoming Medium/High event, and the next HIGH ("red") specifically.
  let next = null, nextHigh = null;
  for (const e of events) {
    if (!ccys.includes(e.country)) continue;
    const rank = IMPACT_RANK[e.impact] || 0;
    if (rank < 2) continue;
    const t = Date.parse(e.date);
    if (isNaN(t) || t < now) continue;
    const ev = { t, title: e.title, ccy: e.country, impact: e.impact,
      minsAway: Math.round((t - now) / 60000), forecast: e.forecast, previous: e.previous };
    if (!next || t < next.t) next = ev;
    if (rank === 3 && (!nextHigh || t < nextHigh.t)) nextHigh = ev;
  }

  const active = relevant[0] || null;
  let level = 'none';
  if (active) level = active.impact === 'High' ? 'high' : 'medium';

  return { ok: true, ccys, level, active, upcoming: relevant, next, nextHigh };
}

// Fold the news assessment into a signal (non-destructive).
export function applyNews(signal, news, opts = {}) {
  if (!news?.ok) return { ...signal, news: news || null };
  const out = { ...signal, news };
  if (news.level === 'high') {
    // Within ~15 min either side of high-impact news → stand aside.
    if (Math.abs(news.active.minsAway) <= (opts.blackoutMin ?? 15) && signal.action !== 'NEUTRAL') {
      out.action = 'NEUTRAL';
      out.levels = null;
      out.newsBlackout = true;
    }
    out.confidence = Math.round(signal.confidence * 0.5);
  } else if (news.level === 'medium') {
    out.confidence = Math.round(signal.confidence * 0.8);
  }
  return out;
}
