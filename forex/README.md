# ◆ ForexLens — Free Signal Overlay for TradingView

A free browser extension that overlays **BUY / SELL / NEUTRAL** signals — with a
confidence score, plain-English reasoning, and suggested stop/target — on any
chart you open in TradingView. No account, no subscription, no payment anywhere.

It combines the two ideas from the popular Forex Factory bots, **minus the part
that blows up accounts**:

- **Happy Neuron idea** → a multi-signal "sentiment" score across several
  non-redundant indicators (trend + momentum + volatility + structure).
- **Perceptrader idea** → an *optional* LLM (Gemini) second-opinion filter on entries.
- **Dropped:** the martingale / grid recovery mechanism. That's the exact thing
  that looks great in calm markets and then wipes accounts on a strong trend.

---

## ⚠️ Read this first (honest expectations)

Nobody predicts forex reliably — not this, not any bot, not any LLM. This tool
finds **statistical edges**, not certainties. I backtested it on 2 years of real
hourly data (no look-ahead, spread cost included) and the results are deliberately
shown to you rather than hidden:

| Instrument | Win rate | Profit factor | Expectancy/trade |
|------------|----------|---------------|------------------|
| **Gold (XAUUSD)** | 40.0% | **1.24** | **+0.15 R** |
| ETH | 38.2% | 1.15 | +0.10 R |
| Silver (XAGUSD) | 36.8% | 1.08 | +0.05 R |
| BTC | 35.9% | 1.04 | +0.03 R |
| USDJPY | 35.4% | 1.02 | +0.01 R |
| Oil | 35.1% | 1.00 | 0.00 R |
| EURUSD | 34.4% | 0.97 | −0.02 R |
| GBPUSD | 34.1% | 0.96 | −0.03 R |

**The takeaway:** this is a *trend-confluence* engine. It has a real (modest) edge
on things that **trend** — metals and crypto — and **no edge on the efficient FX
majors** (EURUSD/GBPUSD actually lose after spread). Use it on **gold, silver,
crypto, indices**. Treat majors as "information only."

A profit factor above ~1.2 means "worth testing on a demo account," **not** "free
money." Always demo-test and use proper position sizing before risking real capital.

---

## Install (2 minutes, free)

1. Open Chrome or Edge → `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `forex` folder.
4. Open [tradingview.com](https://www.tradingview.com/chart) and load a chart
   (try **OANDA:XAUUSD** or **BINANCE:BTCUSDT** — the engine's best instruments).
5. The **ForexLens** panel appears top-right. Drag it anywhere. It auto-updates
   every 60s and when you switch symbols.

No build step, no npm, nothing to keep running. Pure JavaScript.

---

## How it works

```
TradingView page ──detect symbol──▶ content.js (overlay panel)
                                         │  ANALYZE message
                                         ▼
                              background.js (service worker)
                                         │
        ┌────────────────────────────────┼─────────────────────────────┐
        ▼                                 ▼                             ▼
  data.js (free Yahoo OHLC)      signal.js (confluence)         gemini.js (optional)
  fast TF + higher TF            4 non-redundant families        LLM sanity check
                                 → score → BUY/SELL/NEUTRAL       CONFIRM/WARN/VETO
```

**The four families** (each measures a *different* aspect of price — real
confluence, not three moving averages saying the same thing):

1. **Trend** — EMA20 vs EMA50 + slope
2. **Momentum** — RSI(14) + MACD histogram
3. **Structure** — swing highs/lows (higher-highs vs lower-lows)
4. **Volatility** — Bollinger %B (mean-reversion / stretch)

They're weighted into a score in [−100, +100]. **Multi-timeframe alignment** (the
fast TF and higher TF must agree) is the biggest quality filter — a conflict
downgrades the call to NEUTRAL. Stop/target come from **ATR at a fixed 1:2 R:R** —
never averaging down.

**Data:** Yahoo Finance's public chart API — free, no key, no signup.

---

## News awareness (always on — not a toggle)

This build is **gold-first**. Since high-impact ("red folder") news moves gold
violently and makes charts lie, ForexFactory news is **always active** and red
events take priority over any chart signal:

- Pulls the free ForexFactory weekly calendar for the pair's currency (XAUUSD → USD).
- Shows a live **countdown to the next 🔴 red event** with its forecast vs previous.
- Near a red event: a pulsing **RED banner** takes over the panel, the chart signal
  is greyed out, and the call is forced to **NEUTRAL — stand aside** (within 15 min
  either side). Confidence is halved for the wider 90-minute window around it.
- Medium ("orange") events show a caution strip and cut confidence to 80%.

If you load a non-gold symbol, the panel tells you plainly it isn't tuned for it.

## Optional: Gemini second opinion

Off by default. Click the extension icon → tick **Use Gemini** → paste a free key
from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). It sends the
indicator summary (no personal data) to Gemini for a CONFIRM / WARN / VETO check.
Pure math already works without it; the LLM just adds context/news awareness.

---

## Backtest it yourself

```bash
node tools/backtest.mjs XAUUSD 1h 1d      # gold, hourly, daily-trend filter
node tools/backtest.mjs EURUSD            # see the majors underperform
MINCONF=65 node tools/backtest.mjs BTCUSD # be pickier
ALIGN=0 node tools/backtest.mjs XAGUSD    # disable the MTF gate to see it matter
```

The backtest is walk-forward (no look-ahead) and shares the **exact same scoring
code** as the live extension, so what you test is what you get.

---

## Settings (extension popup)

- Fast / Higher timeframe
- Reward:Risk and ATR stop multiplier
- Desktop alerts + minimum confidence to alert
- Gemini toggle + key

## Files

```
manifest.json           extension manifest (MV3)
src/content.js          symbol detection + overlay UI
src/background.js        orchestrator (service worker)
src/popup.html/.js       settings
src/overlay.css          panel styling
src/engine/indicators.js EMA, RSI, MACD, Bollinger, ATR, structure
src/engine/signal.js     confluence scoring (shared with backtest)
src/engine/data.js       free Yahoo OHLC + symbol mapping
src/engine/gemini.js     optional LLM filter
tools/backtest.mjs       walk-forward backtester
```

## Disclaimer

Educational tool. Not financial advice. Trading forex/CFDs/crypto carries a high
risk of loss. Signals are probabilistic and will be wrong often. Demo-test first,
size positions responsibly, and never risk money you can't afford to lose.
