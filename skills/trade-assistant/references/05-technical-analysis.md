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

> **Independent-view cross-validation (mandatory, not optional)**: the three gates above are all **inside the toolbox** — they are not independent of each other. Do NOT rest a directional/position conclusion on them alone. Add **independent views** from outside the toolbox:
> - **L2 engine read-only**: if the idea can be backtested, run Freqtrade `backtesting` on that pair (read-only) — what would a proven directional engine strategy say? For range/S6, read Hummingbot grid/controller structure. Engines are **validation views**, not only execution.
> - **L3 info/博弈**: funding, top-trader LS, wallet/smart-money (binance ecosystem) — a genuinely independent data source.
> Adjudication: ≥2 independent views same direction AND no opposing strong view → proceed; conflict → conservative/flat. See SKILL.md Core Workflow A step 3 for the L1–L5 layer list and consistency-matrix output.

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

## Bollinger Bands — 3-tool division of labor (don't duplicate)

The same Bollinger concept is served by three different tools at three different layers. Route per need:

| Layer | Tool | What it does | When to use |
|---|---|---|---|
| **Analyze** (read) | `ta.mjs` (this toolbox) | computes `boll(20,2)` → says where price sits in the band (%B, upper/lower touch, squeeze) in Chinese | "现在价在布林带哪 / 超买超卖读数" — the **analysis read**, feeds LLM judgment |
| **Execute-range** | Hummingbot built-in controllers `bollinger_v1` / `bollinger_v2` / `bollingrid` (via `hummingbot-mcp`) | full range/mean-reversion bot logic (buy at lower band, exit upper) | range/S6 ambush, mean-reversion **automated** runs → Hummingbot |
| **Execute-trend (optional)** | Freqtrade strategy with Bollinger (from ecosystem) | Bollinger-based directional/breakout strategy, backtestable | a Bollinger idea worth backtesting/validating → Freqtrade |

Routing rule: **read = ta.mjs; run a band-range bot = Hummingbot; validate a band-breakout strategy = Freqtrade.** `/binance` ecosystem skills provide raw klines only — they do NOT compute indicators (no duplication there).

> 用户可见输出中文。布林带是第二道确认（ref 05 Position in Signal System），非进场依据本身；T3 庄家币上布林带信号可能被操纵，与 TA 一样失效（ref 00/04）。
