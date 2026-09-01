---
name: trade-assistant
description: 币安 U 本位永续合约交易助手（D:\trade 项目），强依赖 /binance 生态。当用户提到 看盘、盘面、"现在呢"、持仓、挂单、下单、开仓、平仓、撤单、改单、止损、止盈、选币、做多、做空、合约、概率、胜率、爆仓、复盘、周报、月报、交易计划、收益目标、账户余额，或技术分析（RSI、MACD、均线、EMA、布林带、ATR、背离、金叉死叉、K线形态、动能分析、趋势研判），或任何涉及 binance-cli / 币安 U 本位合约 API / fapi.binance.com 的操作时，使用本 skill。Two pillars (A) 计划/复盘/周报/月报 md 文档生成（4 类文档，用户触发）；(B) 辅助 /binance 生态调用编排（binance→行情/执行, crypto-market-rank→信息面, binance-trading-signal→信号/回测, binance-wallet-tracker→博弈面, query-token-*→链上）。分析脚本（scan/coin/ta/prob/solve/pyramid）为降级工具箱。所有写操作走 CONFIRM 审核协议。
---

# Trade Assistant — D:\trade project

**Strategy knowledge base lives in `references/`** (relative to this file: `references/00-core-playbook.md` … `07-trade-log-and-review-template.md`) — the single source of truth. `binance-cli` / fapi API is the execution tool. Your job: analyze per the docs, execute per the protocol, generate documents per the lifecycle.

> **Language rule: all user-facing output — conversation tables, 复盘/周报/月报/计划 document bodies, summaries, error messages — MUST be in Chinese.** This file, references, and scripts are in English for the LLM's efficiency.

## Two Pillars (positioning)

- **Pillar A — Document generation (复盘/总结).** Generate 计划/复盘/周报/月报 markdown documents per the lifecycle below. User-triggered. Heavy lifting (retrospective-writer agent, BM25 similar-review retrieval) lives in the `trade-agents` plugin (`D:\claude-dev\agents`) and is delegated to it.
- **Pillar B — /binance orchestration.** For any binance capability, decide the provider per the dependency table below, execute/format, summarize in Chinese. Order placement always goes through the CONFIRM protocol.

## Document Lifecycle (what becomes a file, what stays in chat)

| Stage | Form | Name / location |
|---|---|---|
| **交易计划** | chat-only (table); saved to `D:\trade\plans\计划_YYYYMMDD_币种.md` only on explicit request | — |
| **Executing** | no file. After close, `sync.mjs` ingests flows into SQLite (`data/trade.db`) | — |
| **Fully closed** | **复盘 md (mandatory)**: pull that position's orders/flows, generate per `references/07-trade-log-and-review-template.md` | `D:\trade\retrospectives\复盘_起始日期-结束日期_币种.md` |
| **Archive** | after generating 复盘 → `git add + commit` (msg: `复盘 ARB 20260901-0902 +36.7U`) | git |
| **Strategy change** | edit the relevant `references/` doc directly, commit what/why | git |
| **周报** | **Sundays** (or user says 周报): run `node scripts/summary.mjs weekly`, analyze win rate / drawdown / tier attribution | `D:\trade\retrospectives\周报_YYYYMMDD_YYYYMMDD.md` → git |
| **月报** | **1st of month** (or user says 月报): `node scripts/summary.mjs monthly` + `plan.mjs` validates next targets | `D:\trade\retrospectives\月报_YYYY-MM.md` → git |

周报/月报 are **decision documents** — the "决策输入" block (fee share, T3 P&L, winning-day share, drawdown) feeds next-period `plan.mjs` target validation and ladder adjustment. Monthly must answer: ① which signal class drove profit/loss? ② discipline execution rate (planned vs deviated)? ③ should the ladder move up or down?

复盘 trigger: user says 复盘/平仓了/这一单结束了, or a fully-closed position with realized P&L and no review yet is detected → prompt. Content must include: execution-vs-plan deviation, P&L attribution (signal/discipline/luck), signal+tier labels, improvement items.

## Environment Facts (true every session — do NOT rediscover)

1. **Network**: direct Binance API is blocked; must use local proxy `http://127.0.0.1:7897`.
   - curl: `curl -x http://127.0.0.1:7897 <url>`
   - binance-cli: `export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897`
2. **Domains**: spot `api.binance.com`, futures `fapi.binance.com` (fapi1/fapi2 302-redirect to the web page — don't use).
3. **Rate limits**: rapid consecutive calls → IP ban ("Way too many requests"). Sleep 2–4s between calls; after a ban wait 30–60s; prefer one curl for full data (e.g. ticker/24hr) over per-coin loops.
4. **Clock drift**: local clock ~2s slower than Binance → signed calls intermittently fail "Timestamp outside recvWindow". Mitigation: sleep 5–8s and retry (usually works in 2–4 tries); also ask the user to sync Windows time.
5. **binance-cli**: Windows only has npm v1.3.0 (official installer script is NOT Windows-supported); profile `my-main` (prod). Occasional "Request failed after 3 retries" = proxy jitter, retry.
6. **Temp files**: analysis JSON → `%USERPROFILE%` (C:\tmp is unwritable in node); delete after use.

## /binance Ecosystem Dependency (strong dependency)

This skill **strongly depends on the external `/binance` skill** (user-level, `npx skills add binance/binance-skills-hub` or `~/.claude/skills/binance`):
- Scripts execute `binance-cli` directly with proxy/retry/rate-limit handling; auth rules follow `/binance`'s `references/auth.md`.
- The toolbox covers only core futures endpoints; **anything not covered** (wallet transfers, spot, margin, earn, staking, sub-account, official Trading Signal, etc.) must be looked up via the `/binance` skill references.
- Provider decision table:

| Need | Provider | How |
|---|---|---|
| Raw market data / funding / LS ratio / OI / orderbook / execution | `/binance` (binance-cli) | Bash via scripts or `binance-cli futures-usds …` |
| 信息面 — social hype / sentiment / smart-money inflow / top-trader PnL ranks | `crypto-market-rank` | its `cli.mjs <subcmd> '<json>'` |
| Signals / backtests / buyability | `binance-trading-signal` | `baw signal …` |
| 博弈面 behavior (accumulate/distribute/round-trip/first-mover) | `binance-wallet-tracker` | `baw tracker …` |
| On-chain token / address / audit | `query-token-info` / `query-address-info` / `query-token-audit` | their CLIs |
| Technical indicators (RSI/MACD/EMA/BOLL/ATR/divergence/patterns) | this skill's toolbox | `node scripts/ta.mjs <SYM> [--interval 1h]` |
| Market scan / coin checkup / prob / solver / pyramid | this skill's toolbox | `scan.mjs` / `coin.mjs` / `prob.mjs` / `solve.mjs` / `pyramid.mjs` |

**Any WRITE operation (orders/leverage/transfers), regardless of data source, MUST pass through this skill's CONFIRM protocol.** If `/binance` is not installed: tell the user `npx skills add binance/binance-skills-hub` and what's unavailable.

## Analysis Toolbox (scripts — secondary; zero-dep Node; network scripts auto proxy/retry/rate-limit, local SQLite/file tools need none)

| Script | Purpose | When |
|---|---|---|
| `scan.mjs` | full-market scan: tone, gainer/volume leaderboards, long share | morning re-rank; "盘面/行情" |
| `coin.mjs <SYM>` | single-coin checkup: price, 24h, funding, LS ratio, 15m vol-price, walls, range | pre-entry checklist; a specific coin |
| `ta.mjs <SYM> [--interval 1h]` | **technical analysis**: RSI/MACD/EMA/BOLL/ATR/divergence/patterns + composite score | timing confirm; "技术面/指标" |
| `prob.mjs <SYM> <entry> <qty> <targetU\|target=price> [--stop] [--liq]` | Monte-Carlo probability of hitting target/stop/liq at 14h/24h/48h | "胜率/概率/多久到 X" |
| `solve.mjs <SYM> [--entry] [--qty] [--equity] [--posfrac]` | **stop/TP solver** — EV-optimal grid + first-touch Monte-Carlo + tier discounts + wick buffer; >6% red line → shrink suggestion | **every trade plan (mandatory)** |
| `pyramid.mjs <SYM> <LONG\|SHORT> --equity <U>` | pyramid builder: probe 2% → add 6% → trend 12%, each batch's triggers + composite stop | new position (default build method) |
| `position.mjs` | positions + open orders + P&L (incl. liq distance) | "现在呢/看持仓"; session start |
| `sync.mjs --days N` | pull exchange flows into SQLite (truth source) | **daily close; before any report/review** |
| `report.mjs [--days 30]` | P&L analysis: by coin/tier/big-loss/DD | "这周/这月表现"; review data source |
| `plan.mjs --target X --days N --equity Y` | target math validation + 3 plans (A稳健/B延续/C激进) | "目标/多久赚 X"; monthly |
| `summary.mjs weekly\|monthly` | 周报/月报 generator (auto md + archive) | Sundays / 1st; "周报/月报" |
| `vector.mjs query "<text>" [--top N] [--filter review\|reference]` | local BM25 retrieval over retrospectives + strategy KB (no network) | 复盘相似案例; "找一下类似复盘" |

Known issue: `position.mjs` can hang on proxy jitter (>60s no output → kill it); fallback: `export HTTPS_PROXY=... HTTP_PROXY=...` then manually `binance-cli futures-usds account-information-v2` with 2–4 retries.

## Hard Rules (from `references/00-core-playbook.md`, highest priority)

1. **CONFIRM protocol (top priority)**: any order/close/cancel/leverage/transfer → first output the **complete trade plan** for user review. One-shot plan, no stepwise probing. Plan must include: all orders (entry + stop + TP) with full params (symbol/side/type/price/qty/reduce-only); execution order, margin, max loss, expected gain; **risk note** (max loss, liq distance, wick/slippage, the signal's historical failure mode); **win-rate estimate** (`prob.mjs` Monte-Carlo + economics logic + game-theory judgment S1-S6/script stage/crowding cross-validated — if they conflict, state so, take conservative); then offer **模式 A (manual — output plan only, no execution)** or **模式 B (auto — user types `CONFIRM`, execute the approved order only)**. Read-only queries (balance/positions/market/prob) need no confirmation.
2. Per-trade loss ≤ 6% of equity; stop placed **at the same time** as entry (STOP_MARKET reduce-only).
3. No new positions 01:00–07:00 (queries/analysis OK).
4. One side only; averaging down on float loss is forbidden.
5. Position follows account state (ref `03-risk-and-position.md` ladder).
6. If the user decides to hold: respect it, stop persuading, switch to monitoring + key-level alerts (prompt at the circuit-breaker defined in ref 00).

## Core Workflows

### A. Document generation (Pillar A — primary)
1. **复盘**: pull that position's orders/flows (SQLite via `sync.mjs`, or `binance-cli all-orders`) → read `references/07-trade-log-and-review-template.md` → vector-query similar past reviews (`node D:\claude-dev\agents\skills\trade-assistant\scripts\vector.mjs query "复盘 <SYM> <character>" --filter review`) → compose Chinese 复盘 md → write to `D:\trade\retrospectives\` → git commit. Prefer delegating to the `retrospective-writer` agent.
2. **周报/月报**: run `summary.mjs weekly|monthly` → review → (monthly) validate next targets with `plan.mjs` → archive.
3. **交易计划**: chat table; save to `D:\trade\plans\` only on request.

### B. Analysis (uses the toolbox)
1. **Daily re-rank** (`scan.mjs` → filter per ref 01 → `coin.mjs` per candidate, sleep 3s between → output tone + ≤3 long + ≤3 short with S1–S6 labels).
2. **Trade execution** (user wants to place): read playbook (ref 02) → `coin.mjs` capital/game side (gate 1) → `ta.mjs` technical timing (gate 2) → psychology check (ref 06 §5) → `pyramid.mjs` batch structure → `solve.mjs` stops/TPs → full plan table + 模式A/B → wait for `CONFIRM` → execute → update log.
3. **Status check** ("现在呢"): `position.mjs` → per-position `coin.mjs` structure + key levels → output table + liq-distance + structure read; prompt at the 8% daily circuit-breaker.
4. **Probability consult**: `prob.mjs` with REAL position params; always note "model valid on ARB-type mainstream, fails on MM coins"; combine with ref 04 script-stage read — don't just give numbers.

## references Guide (read on demand, not all at once)

| Doc | When |
|---|---|
| `00-core-playbook.md` | session start; any rule conflict → it wins |
| `01-selection-and-signals.md` | morning re-rank; S1–S6 definitions |
| `02-long-short-playbooks.md` | any long/short execution (parameters asymmetric) |
| `03-risk-and-position.md` | sizing, account-state ladder, solve.mjs principle |
| `04-market-maker-playbook.md` | new/meme/high-amp coins; "庄家/插针" |
| `05-technical-analysis.md` | interpreting `ta.mjs`; indicator failure boundaries on T3 |
| `06-pyramid-and-psychology.md` | batch structure, add-barriers, 3-layer resonance, psychology |
| `07-trade-log-and-review-template.md` | logging; generating 复盘 md after full close |

## Output Language

Chinese. Tables over paragraphs. Numbers must come from live API/db measurements — never from memory.
