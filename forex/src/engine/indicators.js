// indicators.js — pure technical-analysis math. No dependencies.
// Every function takes plain number arrays and returns arrays aligned to the
// input length (leading values are `null` until the indicator has enough data).

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { out[i] = prev; continue; }
    if (prev == null) {
      // seed with SMA once we have `period` samples
      if (i >= period - 1) {
        let s = 0;
        for (let j = i - period + 1; j <= i; j++) s += values[j];
        prev = s / period;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

// Wilder's RSI (the standard TradingView uses).
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  out[period] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const line = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null);
  const cleanLine = line.map(v => (v == null ? 0 : v));
  const sig = ema(cleanLine, signal).map((v, i) => (line[i] == null ? null : v));
  const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null));
  return { line, signal: sig, hist };
}

// Standard deviation over a trailing window (population).
export function rollingStd(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let mean = 0;
    for (let j = i - period + 1; j <= i; j++) mean += values[j];
    mean /= period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(v / period);
  }
  return out;
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const sd = rollingStd(values, period);
  const upper = mid.map((m, i) => (m != null && sd[i] != null ? m + mult * sd[i] : null));
  const lower = mid.map((m, i) => (m != null && sd[i] != null ? m - mult * sd[i] : null));
  // %B: where price sits inside the bands (0 = lower band, 1 = upper band)
  const pctB = values.map((v, i) =>
    upper[i] != null && upper[i] !== lower[i] ? (v - lower[i]) / (upper[i] - lower[i]) : null);
  return { mid, upper, lower, pctB };
}

// Average True Range (Wilder) — used for stop/target sizing and volatility regime.
export function atr(highs, lows, closes, period = 14) {
  const tr = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { tr[i] = highs[i] - lows[i]; continue; }
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < closes.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

// Simple swing-structure read: are we making higher highs/lows (uptrend),
// lower highs/lows (downtrend), or neither? Looks at the last `lookback` bars.
export function swingStructure(highs, lows, lookback = 20, endIdx = null) {
  const n = (endIdx == null ? highs.length : endIdx + 1);
  if (n < lookback * 2) return { trend: 0, detail: 'insufficient data' };
  const recentH = Math.max(...highs.slice(n - lookback, n));
  const priorH = Math.max(...highs.slice(n - lookback * 2, n - lookback));
  const recentL = Math.min(...lows.slice(n - lookback, n));
  const priorL = Math.min(...lows.slice(n - lookback * 2, n - lookback));
  const hh = recentH > priorH, hl = recentL > priorL;
  const lh = recentH < priorH, ll = recentL < priorL;
  if (hh && hl) return { trend: 1, detail: 'higher highs & higher lows' };
  if (lh && ll) return { trend: -1, detail: 'lower highs & lower lows' };
  return { trend: 0, detail: 'range / mixed structure' };
}

export function last(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}
