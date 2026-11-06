# Tori Trades (Victoria Duke) — the REAL method

Source: her own video transcript ("Breaking Down My SIMPLE Trading Strategy",
youtube qLtq73bTPBA, pulled via yt-dlp). This corrects the secondhand web
summaries, which distorted several things.

## Core mechanic
- **Tool:** the "ray tool" in TradingView, drawn **manually** (no magnet tool),
  **wicks included**. No indicators. Ever.
- Draw an **up-trendline** (angles up, sits UNDER price, holds it up) and a
  **down-trendline** (angles down, sits OVER price, holds it down).
- **The one hard rule:** price must **NOT** cut / poke / intersect the line. If it
  does, the line is drawn wrong — pull the anchor to the last valid touch.
- Capture **as many touch points as possible**. Point A = first touch (fixed
  pivot); Point B = second point (adjustable angle), dragged to the most recent touch.

## Top-down analysis (the part the summaries omitted)
- Start at the **Monthly** timeframe (the "dinosaur" = start of chart).
- Work DOWN: **Monthly → Weekly → Daily → 4H → 1H → 30m → 5m**, stopping at your
  trading timeframe (5m day-trading, 4H swing).
- **Every new trend line CONNECTS to the previous one** — it starts at the prior
  line's most-recent touch (Point B). "All the lines have to touch."
- Zoom in → adjust slightly, add steeper lines. Rinse and repeat.

## Entry / exit / stop
- **ACTION line** = whichever line price **breaks**. That break is the entry. You
  do NOT predict which one breaks.
- **SAFETY line** = the *opposite* line. It defines the trade: **stay in while
  price respects the safety line; EXIT when price breaks it.**
- **Stop-loss** = placed just **beyond** the safety line (never ON it — we expect
  price to respect it). Because the safety line is sloped, the stop **trails**
  along it as the trade moves. **There is NO fixed take-profit** and no "R"
  target — the safety-line break is the exit.

## Setup types (she tracks which work — "science experiment")
- Trend line break (the meat), 2-touch break, 3-touch break (more touches = more
  confirmation), **break & retest** (breaks action line then taps it from the
  other side), **bounce** (price bounces off the line; action = safety = same line).

## Skip / high-risk vs low-risk
- **Low-risk** = the break happens **close to the safety line** → tight stop.
- **High-risk** = break is **far from the safety line** → wide stop → she PASSES.
- Risk sized to **1–2% of capital** per trade (a "fee"); scales up with experience.

## Horizontal S/R
- Support/resistance / key levels are **added confirmation only**, NOT the meat.
  "I'm a trend line trader, not a support/resistance trader."

## What this means for automating it
The hard, discretionary heart is **drawing the connected top-down trend lines**.
That's a visual skill ("this is going to be very visual"). A single-timeframe
pivot-fit (what `src/engine/tori.js` currently does) does NOT reproduce it and
backtests poorly. Faithful automation needs the connected multi-timeframe
construction — or a shift to *assisting* a human drawing the lines rather than
fully auto-generating signals.

## What the earlier secondhand summaries got WRONG
- "Stop 4 candles after the break" — she never says this.
- Fixed $10 stop / fixed 2R target — wrong; stop = trailing safety line, no target.
- Rigid "3+ taps, 6+ candles apart, 3 weeks, slope < 45°" — not her words; she
  says "as many touches as possible, price mustn't cut through."
- "One attempt per trendline" — not stated.
