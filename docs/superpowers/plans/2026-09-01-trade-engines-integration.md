# trade-engines 统一集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trade-agents 插件作为统一控制面，调用 Freqtrade（方向性回测/执行）与 Hummingbot（网格/做市/套利执行），跑通「盘面分析 → 策略验证 → 自动化执行 → 汇报」完整链路。

**Architecture:** 两引擎独立部署（Freqtrade 于 `E:\trade-bots\freqtrade`，Hummingbot 于 `E:\trade-bots\hummingbot`），trade-agents 只加集成面（REST skill / MCP / orchestrator 路由 / references），分析栈不变。Phase A-F 每阶段独立可测。

**Tech Stack:** Docker Desktop（Hyper-V）、Python 3.11+/uv（Windows）、Freqtrade（futures/REST api_server）、Hummingbot（binance_perpetual + MCP）、Node ≥26（插件）。

**Spec:** `docs/superpowers/specs/2026-09-01-trade-engines-integration-design.md`

## Global Constraints

- 部署目录：Freqtrade `E:\trade-bots\freqtrade`；Hummingbot `E:\trade-bots\hummingbot\{hummingbot-api,mcp}`。插件 `D:\claude-dev\agents\trade-agents`。
- 插件**不写死绝对路径**（MCP 用 `${HUMMINGBOT_MCP_DIR}`；Freqtrade URL 用环境变量默认 `http://127.0.0.1:8080`）。
- 语言边界：skill 层英文；docs 中文；用户可见输出中文。
- 单真相源：skill 改动在 `skills/trade-assistant/`，改后同步镜像 + `diff -rq`。
- 零依赖：插件脚本保持零 npm 依赖。
- CONFIRM：策略级操作（部署/启停/调参）需 CONFIRM；Freqtrade 回测/Hyperopt 是只读无需；引擎内挂撤单由引擎风控管。
- 账户隔离：Freqtrade / Hummingbot / binance-cli 手动，各用独立币安子账户。
- 代理：容器访问币安走 `host.docker.internal:7897`。
- 不碰：condor、Gateway/DEX、Ubuntu、WSL2 发行版、`D:\trade` 数据层。两引擎 P1 均先 dry-run/模拟盘，零真实 key。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `E:\trade-bots\freqtrade\` | Freqtrade 引擎 + 策略 + config | 部署（外部） |
| `E:\trade-bots\hummingbot\{hummingbot-api,mcp}\` | Hummingbot API + MCP | 部署（外部，C 阶段恢复） |
| `.mcp.json` | 注册 `hummingbot-mcp` | Modify |
| `skills/trade-assistant/SKILL.md` | Engines Bridge 小节 + references 指南行 | Modify |
| `skills/trade-assistant/references/08-freqtrade-bridge.md` | Freqtrade REST/信号注入/回测/CONFIRM（英文） | Create |
| `skills/trade-assistant/references/09-hummingbot-bridge.md` | Hummingbot MCP/controller 映射/模拟盘（英文） | Create |
| `agents/binance-orchestrator.md` | 决策表加 Freqtrade + Hummingbot 两行 | Modify |
| `docs/architecture.md`、`docs/usage.md`、`README.md` | 架构/使用/依赖+部署 | Modify |
| 镜像 `D:\claude-dev\skills\trade-assistant` | skill 同步 | Sync |

---

## Phase A: Freqtrade 部署 + 回测演示

### Task 1: Freqtrade Docker 部署

**Files:** `E:\trade-bots\freqtrade`（已克隆，depth 1）

- [ ] **Step 1: 建 user_data 与 config**

```bash
cd /e/trade-bots/freqtrade
mkdir -p user_data
cp config_examples/config_futures.json.example config.json 2>/dev/null || cp config_examples/config.json.example config.json
```
若示例不存在，手工创建 `config.json`（futures/dry-run/api_server）：
```json
{
  "max_open_trades": 3, "stake_currency": "USDT", "stake_amount": "unlimited",
  "tradable_balance_ratio": 0.99, "dry_run": true, "dry_run_wallet": 1000,
  "trading_mode": "futures", "margin_mode": "isolated",
  "exchange": { "name": "binance", "key": "", "secret": "",
    "ccxt_config": { "httpsProxy": "http://127.0.0.1:7897" },
    "pair_whitelist": ["BTC/USDT:USDT"], "pair_blacklist": [] },
  "pairlists": [{"method": "StaticPairList"}],
  "entry_pricing": {"price_side": "same", "use_order_book": true, "order_book_top": 1},
  "exit_pricing": {"price_side": "same", "use_order_book": true, "order_book_top": 1},
  "api_server": { "enabled": true, "listen_ip_address": "127.0.0.1", "listen_port": 8080,
    "verbosity": "error", "enable_openapi": false, "jwt_secret_key": "hb_p1_jwt_2026",
    "CORS_origins": [], "username": "freqtrader", "password": "hb_p1_ft_2026" },
  "bot_name": "freqtrade-p1", "initial_state": "running", "strategy": "SampleStrategy",
  "timeframe": "1h", "fiat_display_currency": "USD"
}
```

- [ ] **Step 2: 写一个 S1-S6 风格策略**

在 `user_data/strategies/RsiMomentum.py` 创建（动量 S1 风格，RSI 超卖买入/超买卖出）：
```python
from freqtrade.strategy import IStrategy
import talib.abstract as ta
from pandas import DataFrame

class RsiMomentum(IStrategy):
    INTERFACE_VERSION = 3
    timeframe = '1h'
    minimal_roi = {"0": 0.04, "120": 0.02, "360": 0.01}
    stoploss = -0.03
    trailing_stop = True
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)
        return dataframe
    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[dataframe['rsi'] < 30, 'enter_long'] = 1
        return dataframe
    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[dataframe['rsi'] > 70, 'exit_long'] = 1
        return dataframe
```
> 若 `talib` 不可用，用 `pandas-ta` 的 RSI（`import pandas_ta as pta; dataframe['rsi'] = pta.rsi(dataframe['close'], length=14)`）。按 Freqtrade `docs/strategy-customization.md` 与模板 `freqtrade/templates/strategy.py` 校验接口。

- [ ] **Step 3: Docker 拉起**

Run:
```bash
cd /e/trade-bots/freqtrade
docker compose up -d 2>&1 | tail -5
docker compose logs --tail=20 2>&1 | tail -15
```
Expected: freqtrade 容器 running，日志含 `Dry run` 且无致命错误。若 docker-compose 未挂载 config/user_data，按其 `docker-compose.yml` 调整卷挂载后重启。

- [ ] **Step 4: 验证 REST api_server**

Run: `curl -s http://127.0.0.1:8080/api/v1/ping`
Expected: `{"pong": "pong"}`（或 JSON 响应）。用 `-u freqtrader:hb_p1_ft_2026` 访问受保护端点。

### Task 2: 回测演示（数据下载 + 回测）

**Files:** 无（Freqtrade 数据/输出）

- [ ] **Step 1: 下载 BTC-USDT 永续历史数据**

Run（容器内或宿主机 freqtrade CLI；无 key 走公共数据）:
```bash
docker exec -it freqtrade freqtrade download-data --config /freqtrade/config.json \
  --pairs BTC/USDT:USDT --timeframe 1h --timerange 20250101-20250701 2>&1 | tail -8
```
Expected: 日志显示下载完成，`user_data/data/binance_futures/BTC-USDT-1h.feather`（或类似）存在。

- [ ] **Step 2: 跑回测**

Run:
```bash
docker exec -it freqtrade freqtrade backtesting --config /freqtrade/config.json \
  --strategy RsiMomentum --timerange 20250101-20250701 2>&1 | tail -25
```
Expected: 回测表输出（胜率/总收益/最大回撤/Sharpe 等），退出码 0。**把关键数字（胜率/收益/回撤/参数）记下来，作为 Phase B 中文汇报的示例数据。**

### Task 3: Freqtrade dry-run 持续运行验证

**Files:** 无

- [ ] **Step 1: 确认 dry-run bot 运行**

Run: `curl -s -u freqtrader:hb_p1_ft_2026 http://127.0.0.1:8080/api/v1/status`
Expected: JSON 数组（可能为空 = 无持仓，但 API 可用）。

---

## Phase B: Freqtrade 集成进插件

### Task 4: references/08-freqtrade-bridge.md

**Files:**
- Create: `skills/trade-assistant/references/08-freqtrade-bridge.md`

- [ ] **Step 1: 写英文桥接文档**

内容覆盖：REST API 端点（`/api/v1/status`、`/api/v1/balance`、`/api/v1/forcebuy`、`/api/v1/start`、`/api/v1/stop`、回测/下载数据命令）；external_message_consumer 信号注入说明（trade-assistant 信号 → Freqtrade）；config 关键字段（futures/isolated/dry_run/api_server）；代理；**CONFIRM 作用域**（策略级需确认，回测/查询只读免确认）；账号隔离。用户可见输出中文。

- [ ] **Step 2: SKILL.md 加 Engines Bridge 小节 + references 指南行**

在 SKILL.md 加 `## Engines Bridge (Freqtrade + Hummingbot)` 小节（定位：插件是调用者；Freqtrade=方向性回测/执行，Hummingbot=网格/做市/套利；CONFIRM 规则），references 指南表加两行（08/09）。

### Task 5: orchestrator 决策表 + docs

**Files:**
- Modify: `agents/binance-orchestrator.md`、`docs/architecture.md`、`docs/usage.md`

- [ ] **Step 1: 决策表加 Freqtrade 行**

```
| **方向性策略回测/Hyperopt/执行** | Freqtrade | read SKILL.md → Engines Bridge + references/08; 回测/Hyperopt 只读免 CONFIRM; 部署/启停策略需 CONFIRM; REST `http://127.0.0.1:8080`（URL 可经 env 覆盖） |
```
- [ ] **Step 2: docs 更新**（architecture 加引擎分层；usage 加"回测这个策略/跑 Freqtrade"场景）

### Task 6: 验证 Freqtrade 集成

**Files:** 无

- [ ] **Step 1: 中文汇报演示**

用 orchestrator 逻辑：调 Freqtrade REST `/api/v1/status` + 回测结果 → 生成中文表格（bot 状态 / 回测胜率·收益·回撤）。输出标注数据来源。
- [ ] **Step 2: 插件回归**

Run: `cd /d/claude-dev/agents/trade-agents && node --test tests/*.test.mjs`
Expected: 19 pass / 0 fail。

---

## Phase C: Hummingbot 部署收尾

### Task 7: 恢复 Hummingbot 部署

**Files:** 无（`E:\trade-bots\hummingbot\hummingbot-api`、`E:\trade-bots\hummingbot\mcp` 已就绪）

- [ ] **Step 1: 确认 Docker 更新完成、compose 启动**

前提：用户已更新重启 Docker Desktop。Run:
```bash
cd /e/trade-bots/hummingbot/hummingbot-api
docker compose up -d 2>&1 | tail -10
docker logs hummingbot-api 2>&1 | grep -i "uvicorn running" | head -2
curl -s http://localhost:8000/ 2>&1 | head -3
```
Expected: 容器 running、日志含 Uvicorn、curl 有响应。
> `.env`（含 `HTTPS_PROXY=http://host.docker.internal:7897`）与 `.setup-complete`、`.emqx/auth-bootstrap.csv` 已在先前步骤创建；如 Docker 更新重置了 volume，按原步骤重建。

- [ ] **Step 2: uv sync + MCP 冒烟**

Run:
```bash
cd /e/trade-bots/hummingbot/mcp && uv sync 2>&1 | tail -4
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' \
  | HUMMINGBOT_API_URL=http://localhost:8000 HUMMINGBOT_USERNAME=admin HUMMINGBOT_PASSWORD=hb_p1_paper_2026 \
  uv run main.py 2>&1 | head -3
```
Expected: `uv sync` 无错；initialize 返回 JSON-RPC 响应。

---

## Phase D: Hummingbot 集成进插件

### Task 8: .mcp.json + references/09 + SKILL.md

**Files:**
- Modify: `.mcp.json`、`skills/trade-assistant/SKILL.md`
- Create: `skills/trade-assistant/references/09-hummingbot-bridge.md`

- [ ] **Step 1: `.mcp.json` 加 `hummingbot-mcp`**

在现有 `binance-trade` 旁追加：
```json
"hummingbot-mcp": {
  "command": "uv",
  "args": ["--directory", "${HUMMINGBOT_MCP_DIR}", "run", "main.py"],
  "env": {
    "HUMMINGBOT_API_URL": "http://localhost:8000",
    "HUMMINGBOT_USERNAME": "admin",
    "HUMMINGBOT_PASSWORD": "hb_p1_paper_2026"
  }
}
```
校验：`node -e "console.log(Object.keys(require('./.mcp.json').mcpServers).join(','))"` → 含 `binance-trade` 与 `hummingbot-mcp`。

- [ ] **Step 2: references/09-hummingbot-bridge.md**

英文文档：MCP 工具类别（account/bot_management/controllers/executors/market_data/portfolio/trading）、controller↔playbook 映射（grid_strike/pmm_mister/position_executor）、`binance_perpetual_paper_trade` 模拟盘、代理、CONFIRM 作用域、账户隔离。

- [ ] **Step 3: SKILL.md Engines Bridge 小节补 Hummingbot 子节**

- [ ] **Step 4: orchestrator 决策表加 Hummingbot 行**

```
| **网格/做市/套利/三重屏障执行** | Hummingbot | read SKILL.md → Engines Bridge + references/09; 策略级部署/启停需 CONFIRM; 查询类直接调 MCP tools |
```

### Task 9: 模拟盘 grid bot 全周期验证

**Files:** 无

- [ ] **Step 1: MCP 注册可见**

Run: `claude mcp list 2>&1 | grep -i hummingbot`
Expected: 出现 `hummingbot-mcp`。

- [ ] **Step 2: MCP tools/list + 只读行情**

Run:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' \
  | HUMMINGBOT_API_URL=http://localhost:8000 HUMMINGBOT_USERNAME=admin HUMMINGBOT_PASSWORD=hb_p1_paper_2026 \
  uv --directory /e/trade-bots/hummingbot/mcp run main.py 2>&1 | head -3
```
Expected: initialize + tools/list 两行响应。

- [ ] **Step 3: 模拟盘 grid bot 全周期（经 orchestrator/MCP）**

按 references/09：在 `binance_perpetual_paper_trade` 部署 `grid_strike`（如 `BTC-USDT`）→ 启动 → `status` → 查询 portfolio/positions → 停止。每步用 MCP 工具返回数据验证。若工具流程与文档不符，按 API 实际响应调整并记录到 Task 13 的 README。

- [ ] **Step 4: 中文汇报 + 插件回归**

中文汇报（bot 状态/模拟 PnL/仓位，标注"模拟盘非实盘"）。`node --test tests/*.test.mjs` → 19/19。

---

## Phase E: 统一控制面

### Task 10: orchestrator 双路由 + CONFIRM 流程统一

**Files:**
- Modify: `agents/binance-orchestrator.md`

- [ ] **Step 1: 完善决策表 + 流程**

决策表已有 Freqtrade + Hummingbot 两行；在 Process 小节补"引擎路由"步骤：按意图选引擎（方向性→Freqtrade；网格/做市/套利→Hummingbot），策略级操作先展示完整计划等 CONFIRM，查询类直接调。补"引擎状态汇总"场景（一次会话汇总两引擎 bot 状态 → 中文表格）。

### Task 11: 信号注入演示（分析 → Freqtrade）

**Files:** 无（演示）

- [ ] **Step 1: 演示 external_message_consumer 或 REST 触发**

用 trade-assistant 的 ta/solve 输出一个信号示例（如 RSI 超卖 + solve.mjs 参数），说明/演示注入 Freqtrade 的路径（Freqtrade config 开 `external_message_consumer` 或 REST `/api/v1/forcebuy`）。**P1 以文档+手动演示为主，不接实盘。**

---

## Phase F: 文档 + 收尾

### Task 12: README + docs 完善

**Files:**
- Modify: `README.md`、`docs/architecture.md`、`docs/usage.md`、`docs/development.md`

- [ ] **Step 1: README 依赖 + 两引擎部署方案**

在「依赖与环境要求」补：Docker Desktop、Python+uv、Freqtrade、Hummingbot、环境变量（`HUMMINGBOT_MCP_DIR`、Freqtrade REST URL 等）。新增「交易引擎部署方案」小节：Freqtrade（Docker、config、回测命令、api_server、代理）与 Hummingbot（E:\trade-bots\hummingbot、Docker、uv MCP、模拟盘）实际跑通的步骤 + 凭据说明 + 账户隔离建议。
- [ ] **Step 2: docs 完善**（architecture 双引擎分层；usage 场景；development 说明"引擎是外部依赖，插件只调用"）

### Task 13: 镜像同步 + 最终验证 + 一次提交

**Files:** 全部

- [ ] **Step 1: 同步镜像**

Run:
```bash
cd /d/claude-dev/agents/trade-agents
cp skills/trade-assistant/SKILL.md skills/trade-assistant/references/*.md /d/claude-dev/skills/trade-assistant/
cp skills/trade-assistant/references/08-freqtrade-bridge.md skills/trade-assistant/references/09-hummingbot-bridge.md /d/claude-dev/skills/trade-assistant/references/
diff -rq skills/trade-assistant /d/claude-dev/skills/trade-assistant
```
Expected: 仅剩分发专属差异。

- [ ] **Step 2: 全量验证 + 提交**

Run:
```bash
cd /d/claude-dev/agents/trade-agents
node --test tests/*.test.mjs 2>&1 | tail -4
for f in skills/trade-assistant/scripts/*.mjs mcp/binance-mcp-server.mjs; do node --check "$f" || echo "FAIL $f"; done
node -e "console.log(Object.keys(require('./.mcp.json').mcpServers).join(','))"
git add -A && git commit -m "feat: integrate Freqtrade + Hummingbot engine bridges (unified control plane)"
git log --oneline -3 && git status --short
```
Expected: 19/19 测试通过；node --check 无 FAIL；mcpServers 含 binance-trade + hummingbot-mcp；一次干净提交；工作树 clean。

---

## 自审记录

- **Spec 覆盖**：§4 集成面→Task 4/5/8/10；§5 部署拓扑→Task 1/2/3/7；§6 阶段 A-F→本计划 Phase A-F；§7 验收→各 Task 验证门 + Task 13；CONFIRM 作用域→Task 4/8/10。
- **占位符**：无 TBD/TODO；每步有命令与预期。Task 1/2 涉及 Freqtrade 具体语法，executor 按其仓库 `docs/` 与 `templates/` 校验（外部项目部署的合理依据，非占位）。
- **类型一致**：`hummingbot-mcp`、`${HUMMINGBOT_MCP_DIR}`、`binance_perpetual_paper_trade`、`grid_strike`、Freqtrade REST `127.0.0.1:8080` 在 Task 间一致。
- **环境风险（执行时适应）**：Freqtrade Docker 卷挂载、回测数据下载耗时、Docker 更新状态（Task 7 前提）、MCP 工具实际部署流程（Task 9 注明按响应调整）。
