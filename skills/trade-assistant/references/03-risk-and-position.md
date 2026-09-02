# 03 Risk & Position (风控与仓位)

> Content in English; user-facing output in Chinese. **The most important page in the whole system — profit is the byproduct of survival.**
> **Engine risk mapping** (see ref 00): `solve.mjs` stop/TP params map to Freqtrade strategy `stoploss`/`trailing_stop`/`minimal_roi` for directional runs; the 6% red line and tier position multiplier bound what you deploy into a Hummingbot controller (funds/limits). The red line applies at the **strategy level** (total stake deployed), not just per manual order.

## 0. Parameter-Solving Principle (since 2026-09-01, highest priority)

**Stops/TPs are never guessed.** Before every trade, run `solve.mjs` (skill script):

1. **Expected value sets parameters**: grid-scan stop×TP combos, Monte-Carlo first-touch (stop first = loss / target first = win), rank by `EV = discounted_winrate × gain − stop_prob × loss`.
2. **Coin tier sets model trust (T1/T2/T3 — pure data-driven, matches solve.mjs):**
   - T1 (high liquidity/low vol; 24h volume ≥200M AND amplitude ≤25%): model ×1.0, position full
   - T2 (medium; volume 50–200M OR amplitude 25–40%): model ×0.85, position ×0.6
   - T3 (high vol/low liquidity; volume <50M OR amplitude >40%): model ×0.65, position ×0.4
3. **Wick buffer**: minimum stop distance = 24h amplitude × 8% (automatically larger on MM coins).
4. **Per-trade red line** (reference default 6% of equity; **effective cap = profile `risk.perTradeCapPct`**): if the solver's per-trade max loss > the cap → must adopt its shrink quantity. A cap above 6% must be flagged in the plan.
5. **Honesty clause**: on MM coins, "win rate" is only cross-validation reference — final call uses the game-theory script in ref 04. If model and game theory conflict, take the conservative value and tell the user.

> **Profile source**: `solve.mjs` and `pyramid.mjs` read `equity` / `leverage` / `positionStyle.mainNormalPct` / `risk.perTradeCapPct` from `D:\trade\strategy-profile.json` (reference defaults here when absent). Per-user risk image is set via SKILL.md "Strategy Profile" flow.

## 1. Kelly Position Sizing (enable after 100 logged trades)

```
f = winrate − (1 − winrate) / payoff
practice position = f × 1/4   (quarter-Kelly)

Example: winrate 55%, payoff 2:1 → f = 0.55 − 0.45/2 = 32.5% → practice 8%
```
**Current (pre-data): start with the empirical ladder below; switch to the formula after 100 trades in ref 07 log.**

## 2. Position Ladder (anti-martingale: add on wins, cut on losses)

| Account state | Main engine | Lottery engine |
|---|---|---|
| 2 consecutive winning days | **30%** (press while hot) | 20% |
| Normal | 25% | 20% |
| Yesterday's loss | **15%** (shrink) | 10% |
| Daily loss > 8% | **stop trading for the day** | stop |

Snowball essence: **full trend exposure when winning in a row; automatic slowdown when losing in a row.**

> **The ladder's Normal-row numbers (Main 25% / Lottery 20%) and the 8% daily stop row are reference defaults** — Main normal % → profile `positionStyle.mainNormalPct`, lottery % → `lotteryPerTradePct`; the 8% daily stop is HARD (profile can only tighten). The win/loss-day multiples (30%/15%) are fixed anti-martingale behavior, not profile-driven.

## 3. Hard Risk Numbers (update as equity grows)

| Rule | 336U phase | 600U phase (300U after withdrawal) | 1500U phase |
|---|---|---|---|
| Daily max loss (forced stop) | 27U (8%) | 24U (8%) | position-halving rule starts |
| Per-trade max loss | 20U (6%) | 18U (6%) | 45U (3%) |
| Stop distance at 20x | 25% pos ≈ 1.2% price | same | — |

## 4. Drawdown & Withdrawal Rules

**600U plan (phase 1):**
```
336U → 600U → halve today's trading → withdraw 300U → continue with 300U
```
- Withdrawal day: **no new positions, no adds** (emotional-trade hotspot).
- After withdrawal, all capital = profit → relaxed mindset → higher execution quality.

**Profit ladder afterward:**
- 300 → 450: withdraw 150
- 450 → 700: withdraw again
- Always keep only a part of the profit at risk.

**Max-drawdown circuit-breakers** (**HARD — not profile-driven, cannot be loosened**):
- 25% drawdown from high → halve all positions, review for one week.
- 40% drawdown → stop live trading for 2 weeks; simulation + log review only.
- (2600U high, 25% = exit line at 1950U.)

## 5. Mathematical Honesty Zone

- **"+6%/day" is an average, not every day**: good days +15~30%, bad days −3~5% — that is the survivable structure.
- "Wait for break-even then earn" is ~half as efficient as opening fresh (every extra 1% hole doubles time cost) — but the cut-vs-hold decision is based on **whether structure is broken**, not emotion.
- "Stable 50%/month" has never been achieved; this plan's monthly vision (2000U) has only 15–25% probability.
- Liquidation probability ≈ 0 ≠ no losses: at 20x, a −5% price move = the entire isolated margin wiped.
