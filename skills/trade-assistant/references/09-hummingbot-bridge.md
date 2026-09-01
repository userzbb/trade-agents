# 09 Hummingbot Bridge (grid / market-making / arbitrage execution)

> Content in English. **All user-facing output MUST be in Chinese.**
> Hummingbot is the **automated execution engine** for grid, market-making, arbitrage, and triple-barrier positions. It is one of two execution engines this skill delegates to — the other is Freqtrade (see `08-freqtrade-bridge.md`).

## Role

- **Grid / market-making / arbitrage / triple-barrier** unattended execution on Binance USDT-M perpetual (`binance_perpetual` connector).
- The analysis stack decides *what* to deploy (pair, range, funds, limits); Hummingbot executes deterministically under its own risk controls.
- NOT a market-intelligence tool — funding/LS/order-book analysis and Chinese reporting stay in the analysis stack.

## Deployment (current P1 state)

| Item | Value |
|---|---|
| API server (engine) | `http://127.0.0.1:8000` (Docker `hummingbot/hummingbot-api`, + emqx broker + postgres) |
| MCP server | `uv --directory ${HUMMINGBOT_MCP_DIR} run main.py` (stdio); `.env` holds API creds |
| Credentials | `admin` / `hb_p1_paper_2026` (P1) |
| Connector | `binance_perpetual_paper_trade` (paper, no API keys) for P1; `binance_perpetual` for real |
| Env vars | `HUMMINGBOT_MCP_DIR` → `E:\trade-bots\hummingbot\mcp`; `HUMMINGBOT_API_URL/USERNAME/PASSWORD` |
| Proxy | engine container → Binance via `HTTPS_PROXY=http://host.docker.internal:7897` |

## MCP tools (via `hummingbot-mcp`)

Categories: `account` / `bot_management` / `controllers` / `executors` / `market_data` / `portfolio` / `trading` / `history`.

Query (no CONFIRM): bot status, positions, balances, market data, executors, history.
Write (CONFIRM): create/start/stop bots, deploy controllers, place/close orders, adjust params.

## Controller ↔ playbook mapping (see refs 00/01/04)

| Playbook situation | Hummingbot controller |
|---|---|
| Range / S6 range-edge ambush / mean-reversion | `grid_strike` (grid) |
| Market-making on MM coins (BTR-type), bilateral quoting | `pmm_mister` / `pmm_v1` |
| Directional with stop/TP (triple-barrier) | `position_executor` (via a V2 controller) |
| Layered averaging | `dca_executor` |

## Deploy / query workflow

1. Read this reference + ref 00 decision framework; select controller + pair + range + funds.
2. Show the **full plan** (controller / pair / funds / grid range or TP-SL / limits / expected risk) → user chooses 模式 A/B → **CONFIRM**.
3. Deploy/start via MCP tools; monitor `status` / `portfolio`.
4. Query-only (status/PnL) needs no CONFIRM; **paper-trade results MUST be labeled 模拟盘非实盘**.

## CONFIRM scope

- **Strategy-level ops need CONFIRM**: deploy/start/stop a bot, adjust controller params, force an order.
- **Read-only, no CONFIRM**: status, portfolio, market data, executors, history.
- Intra-bot order management (grid fills, MM quotes, triple-barrier stop/TP) is handled by Hummingbot's engine.

## Account isolation

Hummingbot uses its **own Binance sub-account keys** (via the API server / `hbot connect`). Do NOT share keys with binance-cli (`my-main`) or Freqtrade.

## Gotchas

- MCP server runs via `.env` (not inline env vars); `uv run main.py` — stdio. A proper `initialize` must include `protocolVersion`/`capabilities`/`clientInfo`.
- Engine container reaches Binance via `host.docker.internal:7897`; without a proxy the perp connector can't pull order books.
- Paper (`binance_perpetual_paper_trade`) needs no keys but still needs live market data → proxy required.
