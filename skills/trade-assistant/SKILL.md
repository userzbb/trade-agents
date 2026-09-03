---
name: trade-assistant
description: 币安 U 本位永续合约交易助手（D:\trade 项目），强依赖 /binance 生态。当用户提到 看盘、盘面、"现在呢"、持仓、挂单、下单、开仓、平仓、撤单、改单、止损、止盈、选币、做多、做空、合约、概率、胜率、爆仓、复盘、周报、月报、交易计划、收益目标、账户余额，或技术分析（RSI、MACD、均线、EMA、布林带、ATR、背离、金叉死叉、K线形态、动能分析、趋势研判），或任何涉及 binance-cli / 币安 U 本位合约 API / fapi.binance.com 的操作时，使用本 skill。Two pillars (A) 计划/复盘/周报/月报 md 文档生成（4 类文档，用户触发）；(B) 辅助 /binance 生态调用编排（binance→行情/执行, crypto-market-rank→信息面, binance-trading-signal→信号/回测, binance-wallet-tracker→博弈面, query-token-*→链上）。分析脚本（scan/coin/ta/prob/solve/pyramid）为降级工具箱。所有写操作走 CONFIRM 审核协议。
---

# Trade Assistant — D:\trade project

**Strategy knowledge base lives in `references/`** (relative to this file: `references/00-core-playbook.md` … `10-nfi-bridge.md`) — the single source of truth. `binance-cli` / fapi API is the execution tool. Your job: analyze per the docs, execute per the protocol, generate documents per the lifecycle.

**Strategy-parameter model.** `references/` is the canonical ruleset AND holds the *reference defaults* for the core risk image (equity 336U, 20x isolated, normal position 25%, per-trade red line 6%, daily stop 8%). Those numeric defaults are **overridden per-user** by `D:\trade\strategy-profile.json` (`${DATA_ROOT}`) when present — the user sets it in a first-time dialogue (agent asks), uses it by default, and changes it later via agent-offered options. **Safety protocols — CONFIRM gate, account isolation, no-hedge, no-averaging-down, 3-loss cooldown, no new positions 01:00–07:00, the 8% daily forced stop, and the 25%/40% drawdown circuit-breakers — are HARD and never profile-driven.**

**References are a SUGGESTION baseline, not a per-user mandate.** Personalizing
strategy (signal filters, game-theory script stages, what NOT to trade, any
prose rule) lives in the user's own `${TRADE_HOME}/strategy-overrides.md`
(`D:\trade\strategy-overrides.md`), NOT in `references/`. Precedence:
**user override > reference**. References stay shared and unchanged.

> **Language rule: all user-facing output — conversation tables, 复盘/周报/月报/计划 document bodies, summaries, error messages — MUST be in Chinese.** This file, references, and scripts are in English for the LLM's efficiency.

## ABSOLUTE GATE — NO (A) fund / (B) engine action without user CONFIRM

**Read before anything else. This gate overrides every other instruction, workflow, or convenience in this file.** Two action classes are **forbidden to execute** until the user has seen a complete plan AND explicitly approved:

- **(A) Fund operations** — any order/close/cancel/leverage/transfer on any exchange/account (binance-cli, MCP, REST — all paths).
- **(B) Engine / strategy state changes** — start/stop Freqtrade / Hummingbot / NFI bot, deploy a strategy/controller, forceenter/forceexit/forcebuy, change live bot params, dry-run→live switch.

Rules:
1. **No auto-execution.** Execute an (A)/(B) action ONLY after: output the complete plan (per Hard Rule 1 below) → offer 模式 A / 模式 B → the user **explicitly types** `CONFIRM` for that exact plan. Never execute inside the same message that shows the plan. Never self-confirm.
2. **Holding tools ≠ permission.** Having `Bash`, or knowing the engine credentials in `references/08/09/10` / `engines.mjs`, does NOT authorize a write. The tools exist for read-only analysis and for the post-CONFIRM execution step only.
3. **Read-only is free.** Analysis, backtesting, Hyperopt, status/balance queries, data downloads, `scan/coin/ta/prob/solve/pyramid/position/engines` need no confirmation — they change nothing.
4. **Engine risk ≠ user approval.** "The engine has stop-loss / dry-run / paper-trade protections" is never a reason to skip the user gate. Dry-run/paper still requires the same plan + CONFIRM before deploy/force.
5. **Every agent and subagent obeys this** (orchestrator, retrospective-writer, any future agent). If an agent lacks authority to confirm, it routes the plan back to the main session for the user.

## Strategy Profile (per-user risk image)

The core risk image is **yours, not a fixed rule**: it lives in `D:\trade\strategy-profile.json` (agent-managed via `node scripts/profile.mjs view|set`). `solve.mjs` and `pyramid.mjs` read it for defaults (CLI arg > profile > reference default); absent → reference defaults in `references/`.

| Field | Key | Consumed by |
|---|---|---|
| 账户净值 U | `equity` | solve / pyramid |
| 杠杆 x（逐仓） | `leverage` | solve / pyramid |
| 主引擎常态单笔仓位 % | `positionStyle.mainNormalPct` | solve (posfrac default) |
| 主/彩票资金分配 % | `positionStyle.mainPct` / `lotteryPct` | advisory |
| 彩票单笔上限 % | `positionStyle.lotteryPerTradePct` | advisory |
| 单笔最大亏损红线 % | `risk.perTradeCapPct` | solve / pyramid |
| 单日熔断 %（**只可收紧，硬上限 8%**） | `risk.dailyCircuitBreakerPct` | advisory (clamped ≤8%) |

**First-time setup (agent-triggered).** When about to run a sizing/planning step (Core Workflow A step 4 `solve.mjs`, pyramid, or any trade plan) AND `strategyProfile()._applied` is false → **first ask the short Chinese question set** (each with an offered default), then save via `node scripts/profile.mjs set …`, then re-run the sizing script. Do NOT block pure read-only market queries on a missing profile. Question set: 账户净值 `336U` · 杠杆 `20x` · 主引擎常态单笔仓位 `25%` · 主/彩票分配 `80/20` · 单笔最大亏损红线 `6%` · 单日熔断 `8%（只能收紧）`.

**Change-time flow.** User asks to change risk style ("仓位小一点 / 更激进 / 到 600 改净值") → run `view` to show current, offer 2–3 concrete option sets (conservative / current / aggressive) each showing effect on 单笔 U 上限 and liq distance → user picks → `node scripts/profile.mjs set …`. The change must reflect an explicit user choice in that turn. Not an (A)/(B) action → no typed CONFIRM, but never auto-change without the user selecting an option.

**Output reflection.** When a profile is applied, `solve.mjs`/`pyramid.mjs` print `策略档案已应用: …`. If the effective per-trade cap differs from the 6% reference default, the generated plan must call it out.

**Non-goal.** The profile carries ONLY the core risk image above. Tier thresholds, selection thresholds, wick buffer, pyramid batches, and signal parameters stay in `references/` as reference defaults.

## Personal Strategy Overrides (your strategy layer; references stay untouched)

The user's own strategy rules (selection/S1-S6 filters, game-theory script
stages, entries, what-NOT-to-trade, market-state notes) live in
`${TRADE_HOME}/strategy-overrides.md` (default `D:\trade`), layered OVER the
`references/` suggestion baseline. Precedence: **override > reference**;
references are never edited for personalization.

Rules:
1. **Read it before every analysis/plan/execution-route decision** (Core
   Workflow A step 0 and any solve/pyramid/backtest plan). If absent, you may
   seed it with `node scripts/overrides.mjs seed` (idempotent, writes once) —
   only when the user wants personalization; do not create it unprompted.
2. **Edit flow = dialogue.** User states a change ("S3 加成交额≥2亿过滤", "BTR
   第4幕不做多") → agent edits the md under that explicit user choice → `git -C
   ${TRADE_HOME} add strategy-overrides.md`, then `git -C ${TRADE_HOME} commit -m "策略覆盖更新: …"`.
   Not an (A)/(B) action → no typed CONFIRM, but NEVER change it silently or
   invent rules; show what you will write.
3. **Plan annotation (mandatory).** Any 交易计划/回测计划/执行方案 whose inputs
   an override affects MUST state in the Chinese plan body:
   `应用覆盖: "<rule>"（覆盖 references/0X「…」建议）`. If the numeric risk
   profile (strategy-profile.json) is also applied, note both, e.g.
   `策略档案已应用 · 应用覆盖: "只做 S1/S2"（覆盖 references/01 建议）`.
4. `overrides.mjs view` shows the file; `seed` creates it from the bundled
   template. Inspect the file before overriding the same section twice.

## Three-Tool Orchestration (top-level routing)

This skill's core job is to **route each request to exactly one of three tools**, efficiently:

| Tool | What it's for | Interface | CONFIRM |
|---|---|---|---|
| **/binance + binance-cli** | market data, account, **manual discretionary execution** (analysis-driven) | `binance-cli` / fapi | manual orders: **yes** |
| **Freqtrade** | **direction strategy lab**: backtest, Hyperopt, dry-run/live directional execution | REST `http://127.0.0.1:8080` | strategy deploy/start: **yes**; backtest/Hyperopt/query: no |
| **Hummingbot** | **grid / market-making / arbitrage / triple-barrier** automated execution | MCP `hummingbot-mcp` | bot deploy/start: **yes**; status/PnL query: no |

Routing rule of thumb: **analysis/manual** → /binance+cli; **validate a directional idea or run directional** → Freqtrade; **run grid/MM/arbitrage unattended** → Hummingbot. The analysis stack (S1-S6, `solve.mjs`, tier) feeds all three. Details in the provider decision table (below), `08-freqtrade-bridge.md`, and `09-hummingbot-bridge.md`.

## Two Pillars (positioning)

- **Pillar A — Document generation (复盘/总结).** Generate 计划/复盘/周报/月报 markdown documents per the lifecycle below. User-triggered. Heavy lifting (retrospective-writer agent, BM25 similar-review retrieval) lives in the `trade-agents` plugin (`D:\claude-dev\agents\trade-agents`) and is delegated to it.
- **Pillar B — Three-tool orchestration.** For any trading capability, route to /binance, Freqtrade, or Hummingbot per the decision table / Engines Bridge; execute/format; summarize in Chinese. Order placement and strategy-level ops always go through the CONFIRM protocol.

## Document Lifecycle (what becomes a file, what stays in chat)

| Stage | Form | Name / location |
|---|---|---|
| **交易计划** | chat-only (table); saved to `D:\trade\plans\计划_YYYYMMDD_币种.md` only on explicit request | — |
| **Executing** | no file. After close, `sync.mjs` ingests flows into SQLite (`data/trade.db`) | — |
| **Fully closed** | **复盘 md (mandatory)**: pull that position's orders/flows, generate per `references/07-trade-log-and-review-template.md` | `D:\trade\retrospectives\复盘_起始日期-结束日期_币种.md` |
| **Archive** | after generating 复盘 → `git add + commit` (msg: `复盘 ARB 20260901-0902 +36.7U`) | git |
| **Strategy change** | shared-KB baseline → edit the relevant `references/` doc (versioned); personal preference → `${TRADE_HOME}/strategy-overrides.md` | git |
| **周报** | **Sundays** (or user says 周报): run `node scripts/summary.mjs weekly`, analyze win rate / drawdown / tier attribution | `D:\trade\retrospectives\周报_YYYYMMDD_YYYYMMDD.md` → git |
| **月报** | **1st of month** (or user says 月报): `node scripts/summary.mjs monthly` + `plan.mjs` validates next targets | `D:\trade\retrospectives\月报_YYYY-MM.md` → git |

周报/月报 are **decision documents** — the "决策输入" block (fee share, T3 P&L, winning-day share, drawdown) feeds next-period `plan.mjs` target validation and ladder adjustment. Monthly must answer: ① which signal class drove profit/loss? ② discipline execution rate (planned vs deviated)? ③ should the ladder move up or down?

复盘 trigger: user says 复盘/平仓了/这一单结束了, or a fully-closed position with realized P&L and no review yet is detected → prompt. Content must include: execution-vs-plan deviation, P&L attribution (signal/discipline/luck), signal+tier labels, improvement items.

## Environment Facts (true every session — do NOT rediscover)

1. **Network**: direct Binance API is blocked; must use local proxy `http://127.0.0.1:7897`.
   - curl: `curl -x http://127.0.0.1:7897 <url>`
   - binance-cli (same Bash call, env prefix — a bare `export` may not survive across calls):
     `HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 binance-cli <cmd>`
2. **Domains**: spot `api.binance.com`, futures `fapi.binance.com` (fapi1/fapi2 302-redirect to the web page — don't use).
3. **Rate limits**: rapid consecutive calls → IP ban ("Way too many requests"). Sleep 2–4s between calls; after a ban wait 30–60s; prefer one curl for full data (e.g. ticker/24hr) over per-coin loops.
4. **Clock drift**: local clock ~2s slower than Binance → signed calls intermittently fail "Timestamp outside recvWindow". Mitigation: sleep 5–8s and retry (usually works in 2–4 tries); also ask the user to sync Windows time.
5. **binance-cli**: Windows only has npm v1.3.0 (official installer script is NOT Windows-supported); profile `my-main` (prod). Occasional "Request failed after 3 retries" = proxy jitter, retry.
6. **Temp files**: analysis JSON → `%USERPROFILE%` (C:\tmp is unwritable in node); delete after use.
7. **Strategy profile**: `strategy-profile.json` in `D:\trade\` holds the per-user risk image (equity/leverage/position style/risk tolerance). `solve.mjs` & `pyramid.mjs` read it for defaults; absent → reference defaults. Managed via `node <skill-root>/skills/trade-assistant/scripts/profile.mjs view|set`. The hard 8% daily stop and 25%/40% drawdown circuit-breakers can NOT be loosened via profile.

## Environment Self-Check (once per session; `--net` on network/connectivity triggers)

The check starts by reporting the runtime environment (OS/arch/Node, shell
hints, whether the Windows user-env registry is readable). Registry-vs-process
comparison and the canonical engine-dir probes are Windows-only; on macOS/Linux
envcheck degrades to process-env only and reports so — the environment line
makes the applicable scope obvious.

Run `node scripts/envcheck.mjs` **once per session** on the first trade-related
request (local only: env vars + dependency readiness — instant). When the user
asks **网络联通/为什么连不上/交易前** or reports a network/proxy/engine
problem, run `node scripts/envcheck.mjs --net` (adds fapi-via-proxy + engine
REST reachability; ~≤15s). Keep steps 2-4 (table → setx plan → user CONFIRM →
restart Claude Code). A dependency/network failure is warn-only unless it is
the required env var or `--net` fapi-proxy failure (exit 2).

It is read-only and compares each plugin env var in **this session's process env**
vs the **Windows user env (registry)** — the gap is why "hummingbot-mcp won't start":
`.mcp.json` expands `${HUMMINGBOT_MCP_DIR}` from Claude Code's OWN process env at MCP launch.

Protocol (respects the ABSOLUTE GATE — env writes are still a system change):
1. Run it. **Exit 0** → reply one Chinese line (e.g. `环境 OK · HUMMINGBOT_MCP_DIR=…`), no full-table dump; do not re-run within the session.
2. **Exit 2** (a required env var missing / an MSYS `/x/...` path / a `--net` fapi-via-proxy failure) or a warning that needs action → show the Chinese table the script prints.
3. Propose the exact `setx` lines (the script already prints them). This is a config write, not an (A)/(B) fund/engine action — but still **never run `setx` before the user approves** (typed `CONFIRM` or an explicit "设吧/改吧"). Never invent a value silently; if unsure where Hummingbot MCP lives, ask.
4. After approval run the `setx` commands, then tell the user to **fully restart Claude Code** — a var set now does NOT reach the running session or its MCP servers.
5. Do NOT fall back to "just export in the shell" — a shell export can't reach a separately-launched Claude Code; the durable fix is `setx` + full restart.

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
| `profile.mjs view\|set\|clear` | per-user risk image view/edit (strategy-profile.json) | first-time setup; risk-style change |
| `overrides.mjs seed\|view` | personal-strategy overrides file seed/view (`${TRADE_HOME}/strategy-overrides.md`, precedence over references) | first-time personalization; "改一下我的策略/规则" |
| `position.mjs` | positions + open orders + P&L (incl. liq distance) | "现在呢/看持仓"; session start |
| `sync.mjs --days N` | pull exchange flows into SQLite (truth source) | **daily close; before any report/review** |
| `report.mjs [--days 30]` | P&L analysis: by coin/tier/big-loss/DD | "这周/这月表现"; review data source |
| `plan.mjs --target X --days N --equity Y` | target math validation + 3 plans (A稳健/B延续/C激进) | "目标/多久赚 X"; monthly |
| `summary.mjs weekly\|monthly` | 周报/月报 generator (auto md + archive) | Sundays / 1st; "周报/月报" |
| `vector.mjs query "<text>" [--top N] [--filter review\|reference]` | local BM25 retrieval over retrospectives + strategy KB (no network) | 复盘相似案例; "找一下类似复盘" |
| `engines.mjs` | three-engine status dashboard (Freqtrade/Hummingbot//binance) in one Chinese table | "看下三引擎状态/统一看板"; session start |
| `envcheck.mjs` | **env+deps self-check** (default, local): this-session process env vs Windows user env (registry) + dependency readiness; `--net` appends network reachability (proxy→fapi + Freqtrade/Hummingbot/NFI REST); missing required `HUMMINGBOT_MCP_DIR` / MSYS `/x/...` path → prints setx fix lines | **first trade request of a session** (local); "网络联通/为什么连不上/交易前" or a proxy/engine problem → **`--net`**; "环境自检/修环境变量/为什么 hummingbot 连不上" |

Known issue: `position.mjs` can hang on proxy jitter (>60s no output → kill it); fallback (same Bash call — a bare `export` may not survive across calls): `HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 binance-cli futures-usds account-information-v2`, with 2–4 retries.

## Engines Bridge (Freqtrade + Hummingbot — additive execution engines)

This skill is the **control plane / caller** for two externally-deployed execution engines. It does NOT replace the analysis stack or the CONFIRM manual path.

| Engine | Purpose | Interface | Reference |
|---|---|---|---|
| **Freqtrade** | directional/trend **backtest, Hyperopt, dry-run/live execution** | REST API `http://127.0.0.1:8080` (Basic→JWT) | `08-freqtrade-bridge.md` |
| **Hummingbot** | **grid / market-making / arbitrage / triple-barrier** automated execution | MCP server `hummingbot-mcp` | `09-hummingbot-bridge.md` |

Hard rules:
- **Strategy-level ops need CONFIRM**: deploy/start/stop a bot/strategy, force an entry, change engine params — show the full plan first.
- **Read-only / backtest / Hyperopt / queries need no CONFIRM** (analysis only).
- Intra-bot order management (stoploss, grid, triple-barrier) is handled by each engine's own risk controls.
- **Account isolation**: Freqtrade and Hummingbot each use their own Binance sub-account keys; binance-cli (`my-main`) is the manual account. Never share keys.
- Proxy: engine containers reach Binance via `HTTPS_PROXY=http://host.docker.internal:7897` (Docker) or the host proxy.
- Env vars: `HUMMINGBOT_MCP_DIR` locates the Hummingbot MCP repo; Freqtrade URL defaults to `http://127.0.0.1:8080`.

## Hard Rules (from `references/00-core-playbook.md`, highest priority)

1. **CONFIRM protocol (top priority)**: any order/close/cancel/leverage/transfer → first output the **complete trade plan** for user review. One-shot plan, no stepwise probing. Plan must include: all orders (entry + stop + TP) with full params (symbol/side/type/price/qty/reduce-only); execution order, margin, max loss, expected gain; **risk note** (max loss, liq distance, wick/slippage, the signal's historical failure mode); **multi-view consistency matrix** (≥3 independent views from Core Workflow A step 3 — L1 toolbox / L2 engine read-only / L3 info-博弈 / L4 risk / L5 MM-only — which agree, which conflict, and the conservative adjudication taken; a single-model verdict with no matrix is incomplete); **win-rate estimate** (`prob.mjs` Monte-Carlo + economics logic + game-theory judgment S1-S6/script stage/crowding cross-validated — if they conflict, state so, take conservative); **execution-routing menu** (show ALL routes this judgment fits, per ref 00 route-selection adjudication: 手动 /binance · Freqtrade（方向可回测）· Hummingbot（震荡/区间）· NFI（现成趋势，可选）— **agent recommends ONE with reasoning, the USER picks the route**; agent does not decide the route alone); then offer **模式 A (manual — output plan only, no execution)** or **模式 B (auto — user types `CONFIRM`, execute the approved order only)** on the user-chosen route. Read-only queries (balance/positions/market/prob) need no confirmation.
2. Per-trade loss ≤ 6% of equity; stop placed **at the same time** as entry (STOP_MARKET reduce-only).
3. No new positions 01:00–07:00 (queries/analysis OK).
4. One side only; averaging down on float loss is forbidden.
5. Position follows account state (ref `03-risk-and-position.md` ladder).
6. If the user decides to hold: respect it, stop persuading, switch to monitoring + key-level alerts (prompt at the circuit-breaker defined in ref 00).

## Core Workflows

### A. Analysis (feeds all three tools)
0. **Read personal overrides** (`node scripts/overrides.mjs view` if a file may
   exist; read the md) and apply precedence. Affected plan → annotate per the
   Personal Strategy Overrides section.
1. **Daily re-rank** (`scan.mjs` → filter per ref 01 → `coin.mjs` per candidate, sleep 3s between → output tone + ≤3 long + ≤3 short with S1–S6 labels).
2. **Status check** ("现在呢"): `position.mjs` → per-position `coin.mjs` structure + key levels → output table + liq-distance + structure read; prompt at the 8% daily circuit-breaker.
3. **Multi-view cross-validation (mandatory for any directional/position decision)** — do NOT rest a conclusion on one model. Gather **≥3 independent views** and output a **consistency matrix**:
   - **L1 toolbox** — `ta.mjs` structure/TA read (technical side).
   - **L2 engine read-only validation** — if the idea can be backtested: Freqtrade `backtesting` on that pair (read-only, no CONFIRM); for range/S6: Hummingbot grid/controller structure read. Report what a proven engine strategy would say.
   - **L3 info/博弈** — funding, top-trader LS, orderbook walls, wallet/smart-money behavior (binance ecosystem skills).
   - **L4 risk/solver** — `prob.mjs` / `solve.mjs` with REAL params; **always label when the coin is T3/MM and the model is invalid** (ref 00/04) — never present a model's precise % as conclusion on a coin where the model self-declares failure.
   - **L5 (MM coins only)** — ref 04 game-theory script-stage read + Hummingbot range structure.
   **Adjudication**: ≥2 views pointing the same way AND no opposing strong view → proceed with that bias; conflict → take the conservative side or flat. Output the matrix in Chinese (which views agree/disagree), never a single-model verdict.
4. **Probability consult**: `prob.mjs` with REAL position params; always note "model valid on ARB-type mainstream, fails on MM coins"; combine with ref 04 script-stage read — don't just give numbers.

### B. Route to a tool (decision framework per `references/00`)
After analysis, decide which tool executes:
- **Manual /binance** (C): discretionary, small size, needs human judgment, illiquid/low-confidence — you watch it.
- **Freqtrade** (D): a directional S1-S6 idea worth validating/backtesting, or a direction strategy to run unattended.
- **Hummingbot** (E): grid / market-making / arbitrage / mean-reversion / bilateral quoting.
Rule of thumb + signal mapping in `references/00-core-playbook.md` §Three-Tool Decision Framework.

### C. Manual /binance workflow (CONFIRM execution)
1. **Trade execution** (user wants to place): read playbook (ref 02) → `coin.mjs` capital/game side (gate 1) → `ta.mjs` technical timing (gate 2) → psychology check (ref 06 §5) → `pyramid.mjs` batch structure → `solve.mjs` stops/TPs → full plan table + 模式A/B → wait for `CONFIRM` → execute via binance-cli → update log.
2. **Atomic entry+stop+TP** (one call, less race): on CONFIRM, `binance-cli futures-usds place-multiple-orders` with entry (limit) + `new-algo-order` STOP_MARKET + TAKE_PROFIT_MARKET in one batch; large entries use `algo` TWAP to split.

### D. Freqtrade workflow (direction strategy lab + execution; see `08-freqtrade-bridge.md`)
1. **回测/验证** ("回测这个策略 / 验证参数"): read `references/08` → Freqtrade REST: `download-data` if pair missing → `backtesting` → (if asked) `hyperopt` in background → **中文汇报**胜率/收益/回撤/参数，标注数据来源。只读，**免 CONFIRM**。结果亏损要如实报。
2. **运行方向性策略** ("用 Freqtrade 跑 X"): show plan (strategy / pair / stake / stop-TP / risk) → **CONFIRM** → start bot or force entry via REST → monitor `/api/v1/status` → 中文汇报。

### E. Hummingbot workflow (grid / MM / arbitrage execution; see `09-hummingbot-bridge.md`)
1. **部署/启停 bot** ("部署网格/做市 bot"): read `references/09` → show plan (controller / pair / funds / limits) → **CONFIRM** → via `hummingbot-mcp` deploy/start → monitor status.
2. **查询状态/PnL** ("查 bot 状态/盈亏"): `hummingbot-mcp` query → **中文表格**（模拟盘必须标注"模拟盘非实盘"）。只读，免 CONFIRM。

### F. Document generation (Pillar A — record-keeping)
1. **复盘**: pull that position's orders/flows (SQLite via `sync.mjs`, or `binance-cli all-orders` / engine APIs) → read `references/07-trade-log-and-review-template.md` → vector-query similar past reviews (`node <skill-root>/skills/trade-assistant/scripts/vector.mjs query "复盘 <SYM> <character>" --filter review`) → compose Chinese 复盘 md → write to `D:\trade\retrospectives\` → git commit. Prefer delegating to the `retrospective-writer` agent.
2. **周报/月报**: run `summary.mjs weekly|monthly` → review → (monthly) validate next targets with `plan.mjs` → archive.
3. **交易计划**: chat table; save to `D:\trade\plans\` only on request.

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
| `08-freqtrade-bridge.md` | Freqtrade REST/backtest/Hyperopt, signal injection, CONFIRM scope; "回测这个策略/跑 Freqtrade" |
| `09-hummingbot-bridge.md` | Hummingbot MCP tools, controller mapping, paper trade; "帮我部署个网格/查 bot 状态" |
| `10-nfi-bridge.md` | NFI ready-made trend engine — independent deploy, backtest, decision mapping; "用 NFI 回测/跑现成策略" |

## Output Language

Chinese. Tables over paragraphs. Numbers must come from live API/db measurements — never from memory.
