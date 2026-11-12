# Paper trading agent (Tori 4h trendline break)

PAPER ONLY — simulated account, no broker keys, no real orders.

    node agent/paper_agent.mjs --once                 # check once
    node agent/paper_agent.mjs                        # run continuously (every 15 min)
    node agent/paper_agent.mjs --replay SPX500        # replay ~2 years of history
    node agent/paper_agent.mjs --symbols SPX500,XAUUSD,BTCUSD

State: agent/state.json · Log: agent/trades.log (both git-ignored).
Rules: act only on CLOSED 4h bars; enter on a 3-touch trendline break; skip high-risk breaks;
risk 1% equity/trade; max 3 open; stop = safety line but only ever tightens; 3% daily loss cap.
To go live later, replace the `broker` object in paper_agent.mjs with a real broker adapter.
