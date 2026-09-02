# 08 Freqtrade Bridge (direction strategy lab + execution)

> Content in English. **All user-facing output MUST be in Chinese.**
> Freqtrade is the **directional/trend strategy engine**: backtest, Hyperopt (parameter search), and dry-run/live execution of directional strategies (RSI/MACD/EMA/pattern entries). It is one of two execution engines this skill delegates to — the other is Hummingbot (see `09-hummingbot-bridge.md`).

## Role

- **Strategy lab / default L2 validation view**: validate S1-S6 signal ideas + `solve.mjs` stop/TP parameters on historical data before risking money. In Core Workflow A, a directional idea that can be backtested **defaults** to a Freqtrade `backtesting` run as an independent view (read-only, no CONFIRM) — it is a **validation view**, not only an execution tool.
- **Directional execution**: dry-run first (simulated), then optionally live on a dedicated Binance sub-account.
- NOT a market-intelligence tool — funding rates, LS ratios, order-book walls, tier classification, and Chinese reporting stay in the analysis stack (`scan/coin/prob/solve/ta`).

## Deployment (current P1 state)

| Item | Value |
|---|---|
| Engine dir | `E:\trade-bots\freqtrade` (Docker, dry-run) |
| API server | `http://127.0.0.1:8080` |
| Credentials | `freqtrader` / `hb_p1_ft_2026` |
| Config | `user_data/config.json` (futures / isolated / dry_run / api_server) |
| Strategy | `user_data/strategies/RsiMomentum.py` (demo, S1-style) |
| Binance proxy | `HTTPS_PROXY=http://host.docker.internal:7897` in `ccxt_config` (Docker) |

## REST API endpoints (agent-facing)

Base: `http://127.0.0.1:8080`. Use Basic auth (`freqtrader:hb_p1_ft_2026`) to get a JWT, then `Authorization: Bearer <token>`.

| Endpoint | Purpose | CONFIRM |
|---|---|---|
| `GET /api/v1/ping` | liveness | none (read-only) |
| `GET /api/v1/status` | running bot + open trades | none |
| `GET /api/v1/balance` | simulated/real balance | none |
| `POST /api/v1/start` / `stop` | start/stop the bot | **yes (strategy-level)** |
| `POST /api/v1/forcebuy` | force an entry (signal injection) | **yes (strategy-level)** |

## Backtest / Hyperopt workflow

```bash
# data (public, no keys needed)
MSYS_NO_PATHCONV=1 docker exec freqtrade freqtrade download-data \
  --config /freqtrade/user_data/config.json --pairs BTC/USDT:USDT \
  --timeframe 1h --timerange 20250101-20250701
# backtest
MSYS_NO_PATHCONV=1 docker exec freqtrade freqtrade backtesting \
  --config /freqtrade/user_data/config.json --strategy RsiMomentum \
  --timerange 20250101-20250701
# hyperopt (parameter search — slow, run in background)
MSYS_NO_PATHCONV=1 docker exec freqtrade freqtrade hyperopt \
  --config /freqtrade/user_data/config.json --strategy RsiMomentum \
  --hyperopt-loss SharpeHyperOptLoss --spaces buy sell --epochs 100
```

> **MSYS note**: on Windows Git Bash, prefix `MSYS_NO_PATHCONV=1` to `docker exec` so the container path `/freqtrade/user_data/...` is not rewritten.

## Signal injection (analysis → Freqtrade)

- **Preferred**: configure `external_message_consumer` in Freqtrade config so trade-assistant signals (computed in Node) can be pushed to trigger entries. Freqtrade consumes `buy`/`sell` signal messages from an external source.
- **Simpler (P1)**: the agent reads `solve.mjs` / `ta.mjs` output, shows the plan, and on CONFIRM calls `POST /api/v1/forcebuy` with the computed entry — or starts a strategy tuned to those params.

## CONFIRM scope

> **All curl/docker commands in this file are for execution ONLY after the user approves (模式 A/B + typed `CONFIRM`).** Knowing these commands/credentials does not authorize running them without user approval (CLAUDE.md Iron Rule #0 / SKILL.md ABSOLUTE GATE).

- **Strategy-level ops need CONFIRM**: deploy/start/stop a strategy, force an entry, change bot params. Show the full plan (strategy, pair, stake, stop/TP, risk) and wait for 模式 A/B + CONFIRM.
- **Read-only, no CONFIRM**: `ping`, `status`, `balance`, backtests, Hyperopt (analysis only).
- Intra-bot order management (stoploss, trailing) is handled by Freqtrade's engine per the strategy.

## Force entry / exit (agent execution; requires `force_entry_enable: true`)

The primary injection path: the agent computes an S1-S6 signal and **force-enters** a leveraged long/short on the running bot; force-exits by trade id. **CONFIRM required** (strategy-level op).

```bash
# 开仓（dry-run 已实测；带 enter_tag + leverage）
curl -s -u freqtrader:hb_p1_ft_2026 -H "Content-Type: application/json" \
  -d '{"pair":"BTC/USDT:USDT","side":"long","stakeamount":"100","entry_tag":"S1-test","leverage":20}' \
  http://127.0.0.1:8080/api/v1/forceenter
# 平仓（按 trade_id）
curl -s -u freqtrader:hb_p1_ft_2026 -H "Content-Type: application/json" \
  -d '{"tradeid":"1"}' http://127.0.0.1:8080/api/v1/forceexit
```

Config must enable `force_entry_enable: true` and `order_types.entry='limit'` for buy-at-price; stop/TP are strategy-managed (`stoploss`/`minimal_roi`/`trailing_stop`) or exchange-side (`stoploss_on_exchange` → real STOP_MARKET/TAKE_PROFIT_MARKET on Binance). Read state via `/status`, `/profit_all`, `/trades`.

## Message WebSocket (live signal stream)

For real-time push instead of polling:
- Endpoint `ws://127.0.0.1:8080/api/v1/message/ws?token=<ws_token>` — `ws_token` comes from `POST /api/v1/token/login` (JWT response).
- Subscribe to `whitelist` / `analyzed_df` / `new_candle` — the strategy-analyzed dataframe and new-candle events arrive as they happen.
- The plugin can consume `analyzed_df` (indicators computed by the strategy) as a live signal feed — the input source for P3 signal injection (forceenter).
- Complement with `GET /api/v1/pair_candles` (pull the analyzed candles on demand).

## Account isolation

Freqtrade uses its **own Binance sub-account keys** (`hbot connect binance` / config `exchange.key/secret`). Do NOT share keys with binance-cli (`my-main`) or Hummingbot. Dry-run needs no keys.

## Gotchas

- `api_server.listen_ip_address` must be `0.0.0.0` in Docker (else host can't reach it); restart with `docker restart freqtrade` after config edits.
- `jwt_secret_key` must be ≥32 chars.
- Backtests are read-only and safe; a **losing** result is a valid finding — report it honestly (never fabricate a profitable backtest).
