# 00 Core Playbook (打法总纲)

> Content in English; generate user-facing documents/tables in Chinese.
> Created 2026-09-01 | Start capital 336U | Target 1: 600U → withdraw 300U.
> Core philosophy: survive first — profit is the byproduct of survival.

> **Reference defaults, not fixed rules.** The numeric risk image below (start equity 336U, leverage 20x, position %, red-line cap) is the **reference default**; the **per-user effective values come from `D:\trade\strategy-profile.json`** (`equity`/`leverage`/`positionStyle`/`risk`), set by the user in a dialogue. Structural/behavioral rules — Iron Rules, entry templates, no-hedge, daily routine — are fixed. See SKILL.md "Strategy Profile".

## 0. Iron Rules (violating any one = stop trading for the day)

0. **Confirmation gate (highest).** No fund operation (order/close/cancel/leverage/transfer) and no engine/strategy state change (start/stop bot, deploy strategy, forceenter/forcebuy, dry-run→live) is executed until a complete plan is shown and the user explicitly approves (模式 A/B + typed `CONFIRM`). No auto-execution; read-only analysis/backtest is free. This is the same gate as SKILL.md ABSOLUTE GATE / CLAUDE.md Iron Rule #0.
1. Daily loss ≥ 8% of equity (currently ~27U) → forced stop. **HARD — the profile's `dailyCircuitBreakerPct` can only tighten this (≤8%), never loosen it.**
2. Per-trade loss ≤ 6% of equity (currently ~20U); stop-loss placed at the same time as entry. The **≤6% numeric is the reference default**; effective cap = profile `risk.perTradeCapPct` (~20U = 6% of the 336U reference equity). Stop-at-entry discipline is fixed regardless of the cap.
3. 3 consecutive stop-outs → flat for 24h.
4. No new positions 01:00–07:00 (thinnest liquidity, most wicks).
5. One side only — never hedge long+short at 20x.
6. When equity reaches 1500U: halve all new positions (slow is fast on the last stretch).
7. At 600U: halve trading for the day → withdraw 300U → stop (withdrawal days are emotional-trade hotspots).

## 1. Dual-Engine Capital Structure

```
Total equity
├── Main engine 80%: trend continuation (long-first + short when market weak)
│      Coins: ARB / mainstream alts (large cap, bounded wicks, model applies)
│      Position: normal 25% / after-wins 30% / after-loss 15% / big-loss → stop
│      Leverage: 20x ISOLATED
│
└── Lottery engine 20%: market-maker coins (BTR type)
       Coins: new / meme (amplitude 30%+, MM-controlled)
       Per-trade ≤ 5% of equity; NO price stop — use TIME stop (12h no-up → exit)
       Take 2–5x then leave; never convert to main position
```

> **Reference defaults in the diagram above**: 80/20 split → profile `positionStyle.mainPct/lotteryPct`; 20x ISOLATED → profile `leverage`; normal 25% / after-wins 30% / after-loss 15% is the *state ladder behavior* (fixed shape), with normal 25% → profile `positionStyle.mainNormalPct`; lottery per-trade ≤5% → profile `positionStyle.lotteryPerTradePct`. All are reference defaults overridable via `strategy-profile.json`.

## 2. Daily Routine

- **Morning (within 30 min of waking):** re-rank pool (ref 01); list long column + short column (1–2 candidates each); read BTC/ETH 24h direction + funding panorama → set day tone (risk-on → long, risk-off → short, sideways → wait).
- **Intraday:** only trade pool coins; chasing leaderboard changes mid-day = 手痒, forbidden. Before every entry, ask three questions: where is my stop? how much am I willing to lose? am I the liquidity being exited into?
- **Close (before sleep):** if in a position, confirm stop/TP orders exist + log the reason; if flat, close the app — being flat is winning.

## Three-Tool Decision Framework (execution routing)

This playbook is the **brain**; execution routes to one of three tools. This framework decides which:

| Situation | Tool | Why |
|---|---|---|
| Directional trend idea worth validating (break-chase/pullback on mainstream) | **Freqtrade** | backtest/Hyperopt first, then run unattended |
| Grid / range-bound (S6 range ambush), market-making, arbitrage, MM coins | **Hummingbot** | grid/MM/arbitrage controllers, bilateral quoting |
| Discretionary, small, needs human watch, illiquid/low-confidence | **Manual /binance** | CONFIRM protocol, you watch it |
| Any order/close/cancel | **Manual /binance** | write ops always go through CONFIRM |

Signal mapping (ref 01): trend/momentum signals (S1/S2/S4) → Freqtrade strategy candidates; range/fade (S3/S6) + MM conditions → Hummingbot grid/MM; pure discretionary reads → manual.

### Route-selection adjudication (how the agent picks the recommended route)

Ask in order — each narrows the choice:

1. **Market regime** → engine family. 趋势/动量（S1/S2/S4, BOS/break/continuation）→ **Freqtrade / NFI**；震荡/区间/S6 均值回归 → **Hummingbot**；无法归类、低信心、小额 → **手动 /binance**.
2. **Backtestable?** → 方向性且可回测 → 默认先 Freqtrade `backtesting`（L2 验证视角）过了才路由；range → Hummingbot 结构读。一败回测 = 不做，换路由或放弃。
3. **Intent / size / who watches?** → 需人盯/小仓/判断不透明 → **手动**；已验证、可无人值守 → 对应引擎.
4. **NFI priority**: 现成趋势策略适用时（全市场趋势判断），把 NFI 作为 Freqtrade 的**自选交叉验证源**列出（可选，部署了才列）.

**The user owns the route choice** — the agent only *recommends* one route with its reasoning (from the matrix in SKILL.md Core Workflow A). The plan must show the full route menu (手动 /binance · Freqtrade · Hummingbot · NFI-if-deployed) with the recommendation marked, then let the **user pick the route**; only after the user picks does 模式 A/B + CONFIRM gate execution on that chosen route.

Rules:
- **Validate before you run (default, not optional)**: any directional idea that can be backtested → Freqtrade `backtesting` first; range/S6 → Hummingbot structure read. Engines are **validation views**, not only execution (see ref 05 Independent-view cross-validation). A losing backtest is a valid reason NOT to trade it.
- **Execution-routing menu is part of the plan**: the final plan must offer which route this judgment fits — 手动 /binance (discretionary, watch it) · Freqtrade (directional, backtestable) · Hummingbot (range/MM) · NFI (ready-made trend, optional). Recommend one; the user picks the route, then 模式 A/B + CONFIRM gates execution on that route.
- **Unattended ≠ unsupervised**: engine bots run under engine risk controls, but the playbook's 6% red line and tier sizing still bound the deployed stake.
- **CONFIRM at the strategy level**: deploying/starting an engine bot or forcing an entry needs the same plan + CONFIRM as a manual order.
- **Account isolation**: Freqtrade / Hummingbot / binance-cli each on a separate Binance sub-account — never share keys.

## 3. Entry Templates (only these three are legal)

- **A. Break-chase:** volume breakout above day/prior high; entry = retest-confirm of the breakout level.
- **B. Pullback:** pullback within a trend; 15m prior low (long) / prior high (short) holds; shrinking volume stabilizes.
- **C. Range-edge ambush (S6):** well-defined range (≥3 tests of each edge, ≥8h) — limit order below support (long) / above resistance (short); let the MM's wick fill you. The only legal entry on a sideways day.

Any fourth kind ("feels like it will pump", "it's fallen so much it should bounce", "pre-position mid-range") = emotional trade, forbidden.

## 4. Target System

| Stage | Target |
|---|---|
| Phase 1 | 336 → 600U (+78%, est 5–10 days) → withdraw 300U |
| Phase 2 | start from 300U (all profit); ladder: 450 → withdraw 150 / 700 → withdraw |
| Monthly vision | 2000U (prob 15–25%, not forced; +50~170%/mo = elite month) |
| Daily target | +50U is the good-day pass line, not guaranteed; flat on signal-less days (flat costs nothing) |

## 5. Probability Tools (optional before each decision)

Monte-Carlo on real 15m return distribution (100k paths):
- ARB-type mainstream alt: 24h +3% move ≈ 70–85% prob.
- 20x / 25% position: +3% price = +15% equity.
- When liq distance < 20%, liq prob ≈ 0, but the drawdown during the float can reach 2–3× the target depth.
- "Wait for break-even then earn" is ~half as efficient as "cut and open new" — every extra 1% of hole doubles time cost.

## 6. Game-Theory Cards (recite when facing MM coins)

1. Infer type from behavior: funding, top-trader position, orderbook walls — do not predict price.
2. Stand opposite the payer: negative funding → long (S1); overheated positive funding → short (S5).
3. Always ask: "Am I the one the MM is selling to right now?"
4. Weak-dominant strategy: enter at the accumulation-zone lower edge, never mid-pump.
5. Mixed strategy: stops use time/structure, not precise numbers (precise numbers are the wick's target).
6. Don't play illiquid MM coins.

## 7. Document Index

- `01-selection-and-signals.md` — daily pool re-rank criteria, long/short signal definitions (S1–S6)
- `02-long-short-playbooks.md` — long & short full parameter sets (asymmetric)
- `03-risk-and-position.md` — Kelly, position ladder, drawdown rules, solve.mjs principle
- `04-market-maker-playbook.md` — BTR full case + game-theory in practice
- `05-technical-analysis.md` — indicator system, signal-position, failure boundaries
- `06-pyramid-and-psychology.md` — pyramid batches, 3-layer resonance, behavioral psychology
- `07-trade-log-and-review-template.md` — per-trade log + review template (Chinese output bodies)

## 8. Mathematical Honesty Declaration

- "Stable +50%/mo" has never been achieved; 5–10%/mo with controlled drawdown is already top-tier.
- All probabilities are based on historical simulations; **the model fails on MM coins**, only valid for ARB-type mainstream.
- The only sustainable edge is execution discipline; the only certain death is averaging down without a stop.
