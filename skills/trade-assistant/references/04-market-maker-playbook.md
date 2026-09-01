# 04 Market-Maker Playbook (庄家币解剖)

> Content in English; user-facing output in Chinese.
> For coins like BTR/SKR/牛来: price follows the operator's script, not the market. Economic models fail here; game theory is the only tool.

## 1. The BTR 48-Hour Script (2026-08-30 ~ 09-01, recorded)

```
08-30 all day   0.175 → 0.160 slow drift down on shrinking volume   ← Act 1: quiet distribution
08-31 06:00     0.150 → 0.097 −37% in one hour (wick / vacuum)      ← Act 2: violent dump
08-31 daytime   0.095 flat all day                                   ← Act 3: accumulation (collecting blood at fixed price)
09-01 00:00     0.095 → 0.138 +34%                                  ← Act 4: launch
09-01 03:00     0.136 → 0.167 +20%                                  ← Act 5: stair-stepped pump, no pullback
09-01 04:00     0.1717 ≈ pre-crash level                            ← Act 6: back to origin, hunting exit liquidity
```

**Three days complete a full cycle. Every act has recognizable features.**

## 2. Act Identification & Response

| Act | Feature | What you do |
|---|---|---|
| Distribution (drift down, shrinking vol) | slow decline, volume shrinking, weak bounces | avoid; holders trim |
| Dump (wick) | −30%+ in an hour, orderbook vacuum | **never catch the knife** |
| Accumulation (bottom flat) | flat at a fixed price ≥8h, selling exhausted | lottery engine watches; wait for next-act confirmation |
| Launch | first volume bullish candle + bid wall thickening | lottery position entry point |
| Stair-step pump | three consecutive bullish candles, pullback holds prior platform | hold, trail the stop |
| Distribution (high) | volume-up price-flat, bid wall eaten, trending on social | **exit / short (S4 signal)** |

## 3. Which Economics Survive on MM Coins

| Principle | Applies? | Why |
|---|---|---|
| Supply/demand & fund flow | ✅ works | no one can violate it |
| Volatility clustering | ✅ works (stronger) | violent moves cluster |
| Incentives / funding | ✅ works | position data can't be faked |
| Normal-distribution assumption | ❌ dead | wicks are jumps, not continuous motion |
| Support/resistance | ❌ fragile | technical levels are the MM's bait |
| Mean-reversion steady state | ❌ trap | the range itself can be moved |
| Stop-order effectiveness | ⚠️ actually dangerous | swept by wicks + slippage |

**The one inescapable principle: expected value.** The MM pays a real cost to wick (fees/slippage/funding). If your trade has positive EV + a capped per-trade loss, wicks cannot wash out your long-term money.

## 4. Game-Theory Practice Cards

1. **Infer type from behavior**: funding, top-trader ratio, orderbook walls — don't predict price.
2. **Stand opposite the payer**: negative funding → long (S1) / overheated positive funding → short (S5).
3. **Exit-liquidity question**: "Am I the one he is selling to right now?"
4. **Weak-dominant strategy**: only enter at the accumulation lower edge (overlapping the MM's cost = safe zone), never mid-pump.
5. **Mixed strategy**: stops use time/structure, not precise numbers (precise numbers = the wick's target).
6. **Fold is dominant**: don't play MM coins with 24h volume < 30M USDT (the MM itself slips entering/exiting — chaos is expensive).

## 5. Division of Labor — Main vs Lottery Engine

| | Main engine (ARB class) | Lottery engine (BTR class) |
|---|---|---|
| Capital | 80% | 20% (per-trade ≤5%) |
| Tool | probability model + stop orders | script recognition + time stop |
| Basis | statistics, expected value | game theory, behavior patterns |
| Mindset | business | lottery (total loss acceptable) |
