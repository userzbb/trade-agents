# 10 NFI Bridge (ready-made trend strategy pool — NostalgiaForInfinity)

> Content in English. **All user-facing output MUST be in Chinese.**
> NFI (`iterativv/NostalgiaForInfinity`) is an **optional, recommended, ready-made trend strategy pool**, used as **one cross-validation source for LLM analysis** + a market-wide trend rule pool. High-star (3.4k), daily-maintained, CI backtest gate (winrate≥85% / maxDD≤15%), Binance USDT-M futures + shorting supported. Deployed **independently** per its official docker-compose (NOT inside the existing Freqtrade engine). **Zero self-written strategy code** — NFI is the strategy; this skill/agent only assembles config per user intent and runs it.
>
> Official links: repo https://github.com/iterativv/NostalgiaForInfinity · docs https://iterativv.github.io/NostalgiaForInfinity/ · Freqtrade docs https://www.freqtrade.io/

## Role

- **Cross-validation source for LLM analysis**: when trade-assistant has a directional/environment read, cross-check it against NFI's market-wide signal/backtest — multiple independent strategy sources pointing the same way = higher confidence; conflict = downgrade conservative. NOT a replacement for LLM analysis.
- **Market-wide trend pool** (40-80 pairs, `top_coins` selection): not for single-coin local validation — a single-coin short backtest showing 0 trades is EXPECTED (X7 selects coins market-wide), not a fault. Do NOT download GB-scale full-pair data just to force trades.
- NOT a market-intelligence tool — funding/LS/orderbook analysis stays in the binance ecosystem + trade-assistant toolbox.
- Deployed separately → does not occupy the existing Freqtrade engine (port 8080); NFI default API port 8989.

## Official deployment (independent)

Full steps in `docs/nfi-deployment.md` (relative to repo root). Quick path:

```bash
cd /e/trade-bots
git clone https://github.com/iterativv/NostalgiaForInfinity.git nfi && cd nfi
cp live-account-example.env .env     # fill: EXCHANGE__KEY/SECRET (own sub-account), API creds, DRY_RUN=true
docker compose up -d --build          # official compose; default strategy NostalgiaForInfinityX7, futures/isolated
docker compose logs -f freqtrade
curl -s http://127.0.0.1:8989/api/v1/ping    # pong
```

Env facts (official):
- Config via `.env` env vars with `FREQTRADE__*` prefix mapping to freqtrade config; do NOT override `timeframe` (fixed **5m**), `use_exit_signal`/`exit_profit_only`/`ignore_roi_if_entry_signal`.
- Image `freqtradeorg/freqtrade:stable`; official `docker/Dockerfile.custom` builds extra deps (TA-Lib etc.).
- Recommended: 6–12 open trades, 40–80 pairs, Volume pairlist; blacklist leveraged tokens (`*BULL/*BEAR/*UP/*DOWN`).
- Proxy: container reaches Binance via `HTTPS_PROXY=http://host.docker.internal:7897`.

## Backtest (official data tools; read-only, no CONFIRM)

```bash
cd /e/trade-bots/nfi
# download history via official tools script (NostalgiaForInfinityData repo) — or freqtrade download-data for needed pairs+5m
export TRADING_MODE=binance    # exchange
export TRADING_MODE=futures    # spot/futures
export TIMERANGE=20250101-20250601
./tests/backtests/backtesting-analysis-hunting.sh   # official backtest + analysis
```

Or plain freqtrade backtesting against the running container/user_data (read-only):
```bash
MSYS_NO_PATHCONV=1 docker exec nfi-freqtrade freqtrade backtesting \
  --config /freqtrade/config.json --strategy NostalgiaForInfinityX7 --timerange 20250101-20250601
```
> Config assembly is per official `docs/` (mode selection via `entry_mode`, `long/short_entry_signal_params`). If a param is uncertain, Read the NFI official docs (`docs/installation-and-setup.md`, `docs/trading-modes/`) before guessing — never invent config keys.

## CONFIRM scope

> **All docker/curl commands in this file are for execution ONLY after the user approves (模式 A/B + typed `CONFIRM`).** Knowing these commands does not authorize running start/go-live without user approval (CLAUDE.md Iron Rule #0 / SKILL.md ABSOLUTE GATE).

- **Read-only / backtest / query**: no CONFIRM.
- **Start/switch strategy / go live**: strategy-level → full plan + CONFIRM (模式 A/B).

## Decision mapping (ref 00 Three-Tool Decision Framework)

| Situation | Tool |
|---|---|
| Proven trend strategy backtest / market-wide scan / cross-validate a directional idea | **NFI** (optional, if deployed) |
| Directional idea backtest on a *custom* signal | **Freqtrade** (existing engine) |
| Grid / MM / arbitrage | **Hummingbot** |
| Manual discretionary | **/binance** |

NFI is an *additional ready-made option* in the same lane as Freqtrade — prefer it when the user wants a battle-tested general strategy rather than a custom signal.

## Account isolation

NFI uses its **own Binance sub-account keys** (own `.env`). Do NOT share keys with Freqtrade / Hummingbot / binance-cli (`my-main`).

## Gotchas

- NFI is a large multi-mode strategy (X6/X7); it needs **5m data** — first backtest downloads it (may be slow).
- Backtest results are self-reported by the community and not independently audited — treat as baseline, never as guaranteed return; report honestly (a losing backtest is a valid finding).
- If NFI is not deployed, tell the user it's optional and unavailable; the rest of the plugin works as before.
- Strategy-level ops (start/go-live) need CONFIRM; queries/backtests don't.
