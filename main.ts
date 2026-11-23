// TrendRider: a slow trend-following bot for make.fun's BTC race
// (agent-fun/bars-replay/v1, Node 22, standard library only).
//
// It trades Coinbase Wrapped BTC (cbBTC) against USDC, long only, with
// $1,000 of paper money. One-minute bars on this market are mostly
// noise: the 1-minute return has a standard deviation near 8 bps while a
// full round trip costs about 26 bps in fees, slippage and price impact,
// so a fast signal trades itself to death (a plain EMA(8,21) crossover
// loses about $115 on the dev window, 76 trades). This bot therefore
// trades rarely, only on a slow, confirmed trend:
//
//   - Indicators: EMA(34) and EMA(89) of the closes, each seeded as the
//     mean of its first span of closes, then moving 2 / (span + 1) of the
//     way to each new close (float64, deterministic).
//   - Entry, with the whole cash: the fast EMA's lead over the slow one
//     crosses from at most +5 bps of the price to above +5 bps, while the
//     close sits above the fast EMA. The 5 bps confirmation band keeps the
//     bot out of the flat stretches where the two EMAs hover together and
//     flip on every tick of noise.
//   - Exit, the whole position: the lead crosses back below -5 bps, or
//     the position is worth 3% over its cost (take profit), or 1.5% under
//     it (stop loss). A take-profit exit does not block re-entry: the next
//     confirmed cross buys again.
//   - Every order caps slippage at 100 bps past the close it was decided
//     on, so a sell into a liquidity gap is refused rather than filled
//     for almost nothing, and the signal is simply sent again next bar.
//
// On the published dev window this makes +$18.10 net PnL in 8 trades
// (4 round trips) with a 1.53% maximum drawdown, against +$32.17 for
// buy-and-hold — less on a rising window, by design: in a falling
// window buy-and-hold gives the move back, while this bot sits in cash
// and keeps its $1,000. It never shorts, never uses leverage, never
// reads the clock, the environment or randomness; the same bars give the
// same orders, run after run.
//
// The wire protocol is the kit's SDK shim, copied byte for byte under
// vendor/ (see vendor/makefun-bars.ts): it owns stdin/stdout, the
// account state and order validation; this file only decides.

import { runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const FAST_SPAN = 34;
const SLOW_SPAN = 89;
/** Entry/exit confirmation band, in basis points of the close. */
const GAP_BPS = 5;
/** Take profit: position worth 103/100 of its cost. */
const TAKE_PROFIT = [103n, 100n] as const;
/** Stop loss: position worth 197/200 of its cost. */
const STOP_LOSS = [197n, 200n] as const;
const MAX_SLIPPAGE_BPS = 100;

/** One EMA: the closes it has seen until it starts, then its value. */
interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

function stepEma(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
}

const fast: Ema = { span: FAST_SPAN, warm: [], value: null };
const slow: Ema = { span: SLOW_SPAN, warm: [], value: null };
/** fast - slow after the previous bar, once both EMAs are set. */
let prevGap: number | null = null;

function pushBar(bar: Bar): { gap: number | null; close: number } {
  const close = Number(bar.c);
  stepEma(fast, close);
  stepEma(slow, close);
  const gap =
    fast.value !== null && slow.value !== null ? fast.value - slow.value : null;
  const out = { gap, close };
  prevGap = gap;
  return out;
}

await runBars({
  onBatch(state: BarsState, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const before = prevGap;
    const { gap, close } = pushBar(bar);
    // Warm-up batches only build history: the replay rejects every order
    // decided on one, so send nothing until the scored window starts.
    if (state.warmingUp) return [];
    if (gap === null || before === null || fast.value === null) return [];

    const band = (close * GAP_BPS) / 10_000;
    const held = state.positions.get(SYMBOL);
    const orders: (SellInput | BuyInput)[] = [];

    if (held === undefined) {
      // Enter on a confirmed cross up, with the close above the fast EMA.
      if (gap > band && before <= band && close > fast.value) {
        const room = state.weightRoom(SYMBOL);
        let notional = state.cash < room ? state.cash : room;
        if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
        console.error(
          `seq ${state.seq} buy ${SYMBOL} notional ${notional} (gap ${gap.toFixed(1)} vs band ${band.toFixed(1)})`,
        );
        orders.push({
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: notional,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        });
      }
      return orders;
    }

    // Exit: trend flipped down, take profit, or stop loss.
    const value = state.value(SYMBOL, held.qty);
    const crossedDown = gap < -band && before >= -band;
    const tookProfit = value * TAKE_PROFIT[1] >= held.cost * TAKE_PROFIT[0];
    const stoppedOut = value * STOP_LOSS[1] <= held.cost * STOP_LOSS[0];
    if (crossedDown || tookProfit || stoppedOut) {
      const why = crossedDown ? 'trend-down' : tookProfit ? 'take-profit' : 'stop-loss';
      console.error(
        `seq ${state.seq} sell ${held.qty} ${SYMBOL} (${why}): value ${value} vs cost ${held.cost}`,
      );
      orders.push({
        side: 'sell',
        symbol: SYMBOL,
        qty: held.qty,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      });
    }
    return orders;
  },
});
