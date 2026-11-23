# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/aan192/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/aan192/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

TrendRider — a slow trend-following bot that trades Coinbase Wrapped BTC
(cbBTC) against USDC, long only, with $1,000 of paper money, for make.fun's
`btc-race-24h-20261123-0511` bounty. One-minute bars on this market are
mostly noise (the 1-minute return's standard deviation is near 8 bps while
a full round trip costs about 26 bps in fees, slippage and price impact),
so a fast signal trades itself to death: a plain EMA(8,21) crossover loses
about $115 on the dev window in 76 trades. This bot trades rarely, only on
a slow, confirmed trend — EMA(34) crossing above EMA(89) by more than
5 bps of the close, with the close above the fast EMA — and exits the whole
position on the cross back, a 3% take profit, or a 1.5% stop loss.

On the published dev window it makes **+$18.10 net PnL in 7 trades** with a
1.54% maximum drawdown (grade-local, process driver, deterministic:
two runs reproduce byte for byte), against +$32.17 for buy-and-hold — less
on a rising window, by design: in a falling window buy-and-hold gives the
move back, while this bot sits in cash and keeps its $1,000. It never
shorts, never uses leverage, never reads the clock, the environment or
randomness. The wire protocol is the kit's SDK shim, copied byte for byte
under `vendor/`; `main.ts` only decides.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1 on stdin/stdout (one JSON line per
minute bar, one reply per batch). To grade it on the dev window exactly as
the server does:

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=xmjv0bg8&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
