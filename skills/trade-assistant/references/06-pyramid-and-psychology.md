# 06 Pyramid Adding & Behavioral Psychology (金字塔加仓与博弈心理)

> Content in English; user-facing output in Chinese.
> Core idea: **verify the judgment with a small probe first, add only after it confirms — never load up all at once.**
> Paired with `scripts/pyramid.mjs` (outputs the batched plan).

## 1. Why Pyramid Adding Lowers Liquidation Risk

Loading full size in one shot: wrong entry → full-size loss; right entry → no room to add.

Pyramid (probe–confirm–trend, three batches) shifts risk forward:
- **Wrong**: only the probe (2%) is exposed; the stop loses small money — the cost of being wrong is tiny.
- **Right**: each batch adds at a better/confirmed level, average cost is sound, heaviest exposure when the trend is confirmed (heavy when winning big).
- **Liquidation distance**: batched average cost sits far from any single entry, each batch has an independent stop → total liquidation risk far below one-shot full size.

Mathematical essence: **make position size proportional to how much the market has validated your judgment.**

## 2. Three-Batch Structure (pyramid.mjs output)

| Batch | Margin | Entry condition | Stop |
|---|---|---|---|
| **Probe** | ~2% | S1–S6 signal first appears (capital-side + TA-side initial resonance) | widest −4% (room to test) |
| **Add 1** | ~6% | price moves ±1×ATR past the probe, AND MACD same-direction / RSI above 50 | −2.5% |
| **Add 2 (trend)** | ~12% | pullback holds the prior batch high/low + volume new extreme (trend confirmed) | −2% (tight) |

- Cumulative full exposure scales by tier: T1 ≤20%, T2 ≤12%, T3 ≤8% (engine auto-scales via posMult).
- **Adds only in the direction of float profit** (never average down on a loss — the #1 liquidation cause).
- Composite stop tightens as you add: wide at probe, move to −2.5% when full.
- Max risk always stays under the 6% equity red line (engine warns to shrink a batch if exceeded).

## 3. Add-Barriers (ANY one true → do NOT add)

1. Technical flip: MACD reversed, broke/reclaimed key EMA, reverse divergence appears.
2. Capital flip: funding suddenly crowded, orderbook walls reversed, top-trader ratio turned.
3. Price hasn't moved 1×ATR and is ranging (judgment unvalidated → time stop).
4. Already near the target price (never add the trend batch at highs).

**Probe-failure handling**: take the stop directly — 2% tuition, no add, no averaging. This is the cheapest insurance the pyramid offers.

## 4. Three-Layer Resonance (pass this before every batch)

```
Layer 1 Algorithm/TA (ta.mjs)
  RSI direction, MACD cross, EMA stack, divergence, patterns → sets timing
Layer 2 Capital/game-theory (coin.mjs)
  funding temperature, top-trader ratio, orderbook-wall direction, volume → sets direction
Layer 3 Behavioral psychology (below)
  which act the MM is playing, am I the exit liquidity → sets whether to participate
```
Three layers aligned → high confidence, add normally; any layer flipped → downgrade or abandon.

## 5. Behavioral Psychology (the MM's mental war on you)

**1. Retail weaknesses the MM exploits**
- **FOMO (chase fear)**: entering when everyone discusses it = catching distribution. Counter: don't chase the distribution act (ref 04 Act 6).
- **Loss aversion**: holding through losses without a stop. Counter: make stops mechanical.
- **Anchoring**: remembering "my cost is X" — the market doesn't care about your cost. Counter: watch current structure, not break-even.
- **Disposition effect**: take small wins fast, hold losers (opposite of pyramid). Counter: let profit run (trailing TP), cut losses fast.

**2. Reading the MM (infer intent from behavior)**
- Volume-up price-flat at pump end = MM hunting exit liquidity (distribution) → you don't buy.
- Bottom flat on shrinking volume = MM quietly collecting (accumulation) → you may join.
- Sharp wick = stop-sweep / squeeze; the wick's direction is often the false one.
- Extremely crowded funding = most on one side; the MM has motive to trade the other way.

**3. Managing yourself (more important than indicators)**
- **3 consecutive losses → forced flat 24h** (trades made with shaking hands are gifts).
- **Daily target reached → cut positions to lock in**; don't raise stakes because you're "hot" (hot hands are an illusion; probability doesn't change because you won in a row).
- **The probe's purpose**: satisfy the urge to trade with small money; save size for validated high-confidence setups.
- The 6% per-trade / 8% daily circuit-breakers exist to protect **the you who has lost control**.

## 6. Pyramid vs One-Shot Entry

| Scenario | Use |
|---|---|
| High-confidence triple resonance + clear breakout | may enter 50–70% at once (still leave add room) |
| Signal present but needs validation (most cases) | **pyramid three batches** |
| T3 MM coin | probe size only (≤5%), NEVER scale to a trend batch |
| S6 range, sideways | one-shot limit at the range edge (ref 01), pyramid not applicable |
