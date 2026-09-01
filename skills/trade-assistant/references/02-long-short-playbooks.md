# 02 Long / Short Playbooks (做多/做空手册)

> Content in English; user-facing output in Chinese.
> **Long and short are inherently asymmetric — parameters do NOT transfer.**
> Long = main engine core (S1/S2/S6). Short = quick in/out on emotional collapse; NEVER hold a short waiting for slow decay.
> **Parameter source rule (since 2026-09-01): stops/TPs MUST come from `solve.mjs`** (expected-value optimal combo + tier discount + wick buffer). Fixed values below are fallback only when the solver cannot run.

## 1. LONG — Pre-Entry Checklist (ALL checked before any order)

- [ ] Symbol is in today's pool (ref 01 criteria)
- [ ] Market tone risk-on or neutral
- [ ] Funding ≤ +0.05%/8h
- [ ] Entry method is one of: break-chase / pullback
- [ ] Stop price fixed; loss amount ≤ 6% of equity
- [ ] No hedged position (one side only)
- [ ] Not 01:00–07:00

## 2. LONG — Standard Parameters (main engine)

| Param | Value | Note |
|---|---|---|
| Leverage | 20x, **ISOLATED** | confirm via `change-margin-type` before opening |
| Position | normal 25% / after-wins 30% / after-loss 15%; alt ×0.6, MM coin ×0.4 (solver auto) | see ref 03 ladder |
| Entry | limit at spot or pullback level | prefer limit; market only for break-chase |
| Stop | **solve.mjs optimal** (wick buffer = daily amplitude × 8%); fallback −3% | **STOP_MARKET reduce-only** |
| TP1 | **solve.mjs optimal**; fallback +5% → close half | limit reduce-only |
| TP2 | trail remaining: exit below 15m prior high/low | let profit run |
| Red line | solver's per-trade max loss > 6% of equity → must follow its shrink suggestion | hard constraint |

**Position management — check every 30 min while holding:**
1. Stop/TP orders still alive? (Binance occasionally invalidates on margin adjustments)
2. 15m structure changed? (lows still making higher lows?)
3. Funding changed? (long with funding spiking >+0.15% → consider early take-profit)

**Loss decision tree:**
```
Float loss < half the per-trade stop amount
└─ do nothing (stop protects; watch structure)

Float loss near the stop amount
└─ watch structure only: structure broken → let the stop hit; not broken → don't cut early
   (early cut = emotion replacing rules; log it for review)

Float loss AND entry thesis gone (e.g. funding spiked to +0.2%)
└─ market-exit immediately, don't wait for the stop
```

**Prohibited (long):**
- ❌ Averaging down on float loss (counter-trend adding is the #1 liquidation cause)
- ❌ Moving the stop further away (only ever tighter)
- ❌ Hedging both sides
- ❌ Reverse-re-entry right after the stop is swept (wait for at least one closed 15m candle)

**Margin-type + leverage setup before entry:**
```bash
binance-cli futures-usds change-margin-type --symbol <SYM> --margin-type ISOLATED
binance-cli futures-usds change-initial-leverage --symbol <SYM> --leverage 20
```
⚠️ Local clock slower than server → signed calls fail: Control Panel → Time → sync now.

**Long case library:**

| Date | Symbol | Signal | Result | Lesson |
|---|---|---|---|---|
| 08-31 | SKR | S1 neg-funding+breakout | +36U | high-quality signal, but no stop = luck |
| 08-31 | HEMI | S2 pullback (entry too high) | −20U exit | wait for the pullback to complete, don't enter mid-slope |
| 09-01 | ARB | S2 pullback | holding | good entry, but stop wasn't placed (process fixed) |

## 3. SHORT — Three Signal Classes (priority high→low)

### S3 Catch-down chain (highest win rate, daily workhorse)
```
Conditions: BTC/ETH 24h turning down + long-contract share < 30% + strong coin prints a
volume bearish candle breaking its 15m prior low → SHORT.
Capital leaves steadily, not crashing — a stop is comfortable.
Case: 2026-08-31 MAGMA −37% / PROM −15% / ZKC all-day fading channel
```

### S4 Distribution breakdown (lottery-grade reward)
```
Conditions: 24h gain > +40% + high-volume stagnation (volume up, price flat)
+ bid wall eaten / ask wall thickening + breaks lower edge of a ≥4h range
→ SHORT. Last act of distribution; enter only AFTER the breakdown confirms, never guess the top.
```

### S5 Funding-overheat counter (cheapest cost)
```
Conditions: funding > +0.15%/8h AND price stagnant
→ longs pay to hold a crowded position; the MM profits either way (squeeze up or kill down).
You stand on the cheapest side. Funding is a stance bought with money.
```

## 4. SHORT — Standard Parameters (differences from long marked **)

| Param | Value | Why |
|---|---|---|
| Leverage | 20x, isolated | same as long |
| Position | **15–20%** (one tier below long) | **short-squeeze has no ceiling — must shrink** |
| Entry | **on retest-confirm after the breakdown**, not the first bearish candle | the short's knife also needs confirmation |
| Stop | **−2.5%, outside structure** (0.5% above prior high) | **survive the wick** |
| TP1 | **−4% → close half** (faster than long) | fast drop, fast take |
| TP2 | trail against 15m prior low | exit if bounce reclaims prior high |
| **Hold cap** | **12 hours** | **if it hasn't dropped by then, leave — shorts can't wait** |
| **Funding gate** | **only when funding ≥ −0.1%** | negative funding = paying to hold = double loss |

**Three ways shorts die (how all historical shorts got liquidated):**
1. **Holding through a squeeze** — MM pumps to burn shorts, funding goes against you; the 12h rule exists for this.
2. **Shorting the top by feel** — first bearish candle on a pumped coin; must wait for breakdown confirmation.
3. **Holding into negative funding** — 3 funding charges/day + growing float loss = double bleed.

**S6 range-upper-edge ambush (mirror of the long S6):**
```
Conditions: range-quality check passes (edges tested ≥3×, ≥8h alive, volume shrinking, no risk-on breakout sign)
Entry: limit short 0.3–0.8% above resistance
Stop: 1.5–2% outside the upper edge (hard cap)
TP: range lower edge
Logic: when the MM wicks up to sweep short stops, it hands you high-position inventory.
Risk: real breakout → limit catches a knife → stop hits → don't retrade the range that day.
```

## 5. SHORT — risk-off Day Flow

```
Wake → confirm BTC/ETH down + long share <30%
→ re-rank short pool (laggards/leaders due for catch-down)
→ wait for each candidate to break its 15m prior low on volume
→ pick the clearest 1 signal, 15–20% position
→ stop 0.5% above prior high, TP −4% close half
→ close at −8% target or 12 hours
```
The risk-off daily target (+50U) is mainly completed by shorts — **this is how "no market" becomes "a market".**

**Short case library:** *(to be filled from the log)*
