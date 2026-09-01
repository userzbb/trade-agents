# 05 Technical Analysis (技术分析)

> Content in English; user-facing output in Chinese.
> Indicators are a **probability reference / confirmation tool, NOT the entry basis itself**. Final entry still follows signals S1–S6 (ref 01) + `solve.mjs`.
> All computed by `scripts/ta.mjs` (pure Node, zero-dep — no Python/pandas-ta).
> **Dual use**: the same RSI/MACD/EMA/BOLL/ATR readings serve manual TA **and** become the indicators inside a Freqtrade strategy (`populate_indicators`) when a signal is turned into an unattended directional run.

## Indicator System (ta.mjs output)

| Class | Indicator | Use |
|---|---|---|
| **Momentum** | RSI(14) | ≤30 oversold / ≥70 overbought; above 50 = bullish bias |
| | MACD histogram | red bars expanding = momentum up; cross to positive = golden cross (long); to negative = death cross (short) |
| **Trend** | EMA50 / EMA200 | price above both = bullish stack; below both = bearish; tangled = ranging |
| | Bollinger (20,2) | %B: <5% at lower band oversold / >95% at upper overbought |
| | ATR(14) | true range per candle — the volatility basis for stop distance & position |
| **Reversal** | RSI divergence | bottom divergence (price lower low, RSI higher low) = bullish; top divergence (higher high, lower high) = bearish |
| | Candlestick patterns | hammer/hanging man, bullish/bearish engulfing, long-lower-wick needle |

## Composite Judgment Logic

`ta.mjs` outputs a signal score (RSI direction + MACD direction + EMA position + divergence):
- Score ≥ +2: **bullish** (momentum + trend resonance)
- Score ≤ −2: **bearish**
- Score −1~+1: **neutral/ranging** (conflicting → wait, or use S6 range play)

## Position in the Signal System (critical)

TA is the **second confirmation, not the first**:

```
Gate 1: capital/game-theory side (decides direction)
  funding, top-trader LS ratio, orderbook walls, volume, tier T1–T3
        ↓ direction pre-judgment
Gate 2: technical side (confirms timing) — ta.mjs
  RSI oversold/overbought, MACD cross, EMA stack, divergence, patterns
        ↓ timing confirmation
Gate 3: solver (sets parameters) — solve.mjs
  EV-optimal stop/TP combo, wick buffer, 6% red line
        ↓
CONFIRM protocol
```

**Correct usage examples:**
- S1 negative-funding+momentum (long) AND ta.mjs shows RSI recovering from oversold + MACD golden cross + EMA bullish stack → triple resonance, high-confidence long.
- S2 pullback signal BUT ta.mjs shows top divergence + MACD death cross + price below EMA50 → **lower confidence or abandon** (capital side and technical side conflict → conservative).

## Indicator Failure Boundaries (important)

| Scenario | TA reliability |
|---|---|
| T1 mainstream (ARB/OP class) | **High** — liquid, indicators reflect real supply/demand |
| T2 medium | Medium — reference only |
| T3 MM coin (SKR/牛来 class) | **Low — patterns can be manipulated**; the MM can paint a golden cross to lure longs, paint oversold to catch falling knives |

On T3, TA is used **only to judge which act of the script the MM is currently playing** (with ref 04). Never for direct entries. Divergence and patterns on MM coins are usually bait.

## Timeframe Selection

- 15m: short-term entry/exit points, S6 range edges
- 1h: primary trading timeframe (direction + timing balance)
- 4h: medium-term trend, overnight-position reference
- 1d: big-picture direction and trend stage

Multi-timeframe resonance (e.g. 1h + 4h both bullish) = highest confidence; conflicting timeframes → downgrade to short-term.
