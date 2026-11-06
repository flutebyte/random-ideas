// data.js — free OHLC candle fetching via Yahoo Finance's public chart API.
// No API key, no signup. Works from the extension service worker because the
// Yahoo hosts are declared in host_permissions (bypasses page CORS).

const HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com'
];

// Map a TradingView-style symbol to a Yahoo symbol.
//   EURUSD / FX:EURUSD / OANDA:EURUSD  -> EURUSD=X
//   XAUUSD (gold)                       -> XAUUSD=X  (Yahoo also has GC=F)
//   BTCUSD / BTCUSDT / BINANCE:BTCUSDT  -> BTC-USD
export function toYahooSymbol(raw) {
  if (!raw) return null;
  let s = String(raw).toUpperCase().trim();
  if (s.includes(':')) s = s.split(':').pop();       // drop exchange prefix
  const caret = s.startsWith('^');                   // already a Yahoo index ticker
  s = s.replace(/[^A-Z0-9]/g, '');
  if (caret) return '^' + s;

  // metals & commodities — Yahoo uses futures tickers, not =X
  const commodityMap = {
    XAUUSD: 'GC=F', GOLD: 'GC=F', XAU: 'GC=F',
    XAGUSD: 'SI=F', SILVER: 'SI=F', XAG: 'SI=F',
    XPTUSD: 'PL=F', XPDUSD: 'PA=F',
    USOIL: 'CL=F', WTIUSD: 'CL=F', WTI: 'CL=F', UKOIL: 'BZ=F', BRENT: 'BZ=F',
    NATGAS: 'NG=F', XNGUSD: 'NG=F'
  };
  if (commodityMap[s]) return commodityMap[s];

  // stock indices — Yahoo uses ^ tickers (cash index) rather than =X.
  // Cash indices only trade during exchange hours; futures (ES=F etc.) run ~24h
  // and match TradingView's CFD feeds (SPX500 / US500 / NAS100) more closely.
  const indexMap = {
    SPX: '^GSPC', SP500: '^GSPC', SPX500: 'ES=F', US500: 'ES=F', SPY: 'SPY', ES1: 'ES=F',
    NDX: '^NDX', NAS100: 'NQ=F', US100: 'NQ=F', NQ1: 'NQ=F', USTEC: 'NQ=F', IXIC: '^IXIC',
    DJI: '^DJI', US30: 'YM=F', DJ30: 'YM=F', DOW: '^DJI', YM1: 'YM=F',
    RUT: '^RUT', US2000: 'RTY=F', VIX: '^VIX',
    DAX: '^GDAXI', GER40: '^GDAXI', DE40: '^GDAXI', DE30: '^GDAXI',
    UK100: '^FTSE', FTSE: '^FTSE', FTSE100: '^FTSE',
    NI225: '^N225', JP225: '^N225', NIKKEI: '^N225',
    HSI: '^HSI', HK50: '^HSI', CAC40: '^FCHI', FRA40: '^FCHI',
    NIFTY: '^NSEI', NIFTY50: '^NSEI', SENSEX: '^BSESN'
  };
  if (indexMap[s]) return indexMap[s];

  // crypto (…USDT/…USD against a coin)
  const cryptoBases = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'BNB', 'LTC', 'DOT', 'AVAX'];
  for (const base of cryptoBases) {
    if (s.startsWith(base) && (s.endsWith('USDT') || s.endsWith('USD') || s.endsWith('USDC'))) {
      return `${base}-USD`;
    }
  }

  // 6-letter forex pair like EURUSD
  if (/^[A-Z]{6}$/.test(s)) return `${s}=X`;

  // metals / already-suffixed
  if (s.endsWith('=X') || s.endsWith('=F') || s.includes('-')) return s;

  // fallback: treat as forex pair
  return `${s}=X`;
}

function intervalToMs(iv) {
  const map = { '1m': 6e4, '2m': 12e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '60m': 36e5, '1h': 36e5,
    '1d': 864e5, '1wk': 6048e5, '1mo': 2592e6 };
  return map[iv] || 0;
}

// interval: '5m' '15m' '30m' '60m' '1h' '1d'; range: '1d' '5d' '1mo' ...
export async function fetchCandles(symbol, interval = '15m', range = '5d') {
  const ySym = toYahooSymbol(symbol);
  if (!ySym) throw new Error('Could not resolve symbol: ' + symbol);
  const yInterval = interval === '1h' ? '60m' : interval;
  const path = `/v8/finance/chart/${encodeURIComponent(ySym)}?interval=${yInterval}&range=${range}&includePrePost=false`;

  let lastErr;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, { headers: { Accept: 'application/json' } });
      if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) { lastErr = new Error('empty chart result'); continue; }
      const ts = result.timestamp || [];
      const q = result.indicators?.quote?.[0] || {};
      const candles = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if (o == null || h == null || l == null || c == null) continue;
        candles.push({ t: ts[i] * 1000, o, h, l, c });
      }
      // Drop ALL still-forming trailing candles so the signal is STABLE within a
      // bar and only changes when a bar actually closes (matches the backtest).
      // Yahoo can return TWO trailing bars for the current period (the period bar
      // + a live snapshot), so we loop rather than pop once.
      const intervalMs = intervalToMs(yInterval);
      let formingDropped = false;
      const now = Date.now();
      while (candles.length && intervalMs && candles[candles.length - 1].t + intervalMs > now) {
        candles.pop();
        formingDropped = true;
      }

      if (candles.length < 30) { lastErr = new Error('too few candles returned'); continue; }
      return { symbol: ySym, interval: yInterval, candles, formingDropped };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('fetch failed');
}
