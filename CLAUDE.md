# CLAUDE.md — trade-agents

Single installable Claude Code plugin for the Binance USDT-M perpetual futures system. Everything is bundled (skill + MCP + agents + BM25 vector search); the only external dependency is the `/binance` skill (binance-cli) and the `D:\trade` data layer.

> For AI agents working in this repo. Read `docs/` for detailed human docs.

## Key paths

- Plugin root: `D:\claude-dev\agents\trade-agents`
- **Skill (single source of truth)**: `skills/trade-assistant/`
  - Strategy KB: `references/` — 8 English files `00-core-playbook` … `07-trade-log-and-review-template` (contains Chinese output templates)
  - Scripts: `scripts/` — 14 zero-dep Node scripts (scan/coin/ta/prob/solve/pyramid/position/sync/report/plan/summary/db/_lib/vector)
- Agents: `agents/*.md` (`retrospective-writer`, `binance-orchestrator`)
- MCP: `mcp/binance-mcp-server.mjs` + `.mcp.json`
- Docs: `docs/` — architecture · skill-guide · agents · vector-search · usage · development · conventions
- Data layer: `D:\trade` (`TRADE_HOME`) — SQLite + retrospectives + plans
- Mirror: `D:\claude-dev\skills\trade-assistant` (**deprecated, do not sync**)

## Three iron rules

1. **Language boundary.** Skill-layer content (SKILL.md, references, script comments, agent prompts, this file) = English. **ALL user-facing output** (复盘/周报/月报/计划 doc bodies, conversation tables, summaries, error messages) = **Chinese**. Never produce user-facing text in English.
2. **Single source of truth.** The skill lives in `skills/trade-assistant/`. The old mirror `D:\claude-dev\skills\trade-assistant` is **deprecated — do not sync or maintain it**.
3. **Writes go through CONFIRM.** Any order/close/cancel/leverage/transfer must first show a complete plan and wait for the user's 模式 A/B choice + `CONFIRM`. Agents never execute writes.

## Common tasks

- **Change a strategy rule** → edit `references/<NN>-*.md` (English), update the SKILL.md references guide table if filenames change.
- **Add a script** → `skills/trade-assistant/scripts/` (zero-dep, comments English, user output Chinese); add a row to the toolbox tables in SKILL.md + `docs/skill-guide.md` + `docs/usage.md`.
- **Add an agent** → `agents/<kebab-name>.md` with frontmatter (`name`/`description`/`model: inherit`/`color`/`tools`) + a `When to invoke` section; validate with `validate-agent.sh`; update `docs/agents.md`.
- **Edit the MCP server** → `mcp/binance-mcp-server.mjs`; keep `confirm: true` on every write tool.
- **Vector index** → `node skills/trade-assistant/scripts/vector.mjs index` (cache `D:/trade/vector-index.json`, gitignored).

## Don'ts

- Don't hardcode API keys / credentials (use `binance-cli profile my-main`).
- Don't copy env facts / decision tables into agents — reference SKILL.md instead.
- Don't output user-facing text in English.
- Don't execute Binance writes without CONFIRM.
- Don't add npm dependencies to scripts (zero-dep only).
- Don't edit `D:\trade\**` as part of plugin changes except via the documented scripts (reviews/weeklies are generated + git-committed there by the agents).

## Env facts (authoritative copy in `skills/trade-assistant/SKILL.md`)

Proxy `http://127.0.0.1:7897` · futures domain `fapi.binance.com` · sleep 2–4s between API calls · clock-drift retry (sleep 5–8s) · `binance-cli` Windows npm v1.3.0, profile `my-main` (do NOT use the v2 installer in `/binance` skill — not Windows-supported).
